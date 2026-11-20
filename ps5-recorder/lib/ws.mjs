/**
 * Minimal RFC 6455 WebSocket client (text frames only) built on node:net.
 *
 * The plugin must not depend on npm packages: DSH bundles are installed into a
 * profile without our own dependency tree, so this file implements exactly what
 * obs-websocket v5 needs: HTTP upgrade handshake, masked client text frames,
 * fragmentation reassembly, ping/pong and close.
 */
import net from 'node:net'
import tls from 'node:tls'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const OP_CONT = 0x0
const OP_TEXT = 0x1
const OP_BINARY = 0x2
const OP_CLOSE = 0x8
const OP_PING = 0x9
const OP_PONG = 0xa

export class WebSocketClient extends EventEmitter {
  constructor(url, options = {}) {
    super()
    const parsed = new URL(url)
    this.host = parsed.hostname
    this.port = Number(parsed.port || (parsed.protocol === 'wss:' ? 443 : 80))
    this.secure = parsed.protocol === 'wss:'
    this.path = parsed.pathname + parsed.search || '/'
    this.connectTimeout = options.connectTimeout ?? 5000
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.handshaken = false
    this.closed = false
    this.fragments = []
    this.fragmentOpcode = null
  }

  connect() {
    return new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64')
      this.expectedAccept = crypto.createHash('sha1').update(key + GUID).digest('base64')
      const socket = this.secure
        ? tls.connect({ host: this.host, port: this.port, servername: this.host })
        : net.connect({ host: this.host, port: this.port })
      this.socket = socket
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { socket.destroy() } catch { /* ignore */ }
        reject(error)
      }
      const timer = setTimeout(() => fail(new Error('WebSocket 连接超时')), this.connectTimeout)

      socket.once('error', error => fail(error))
      socket.once('connect', () => {
        socket.write(
          `GET ${this.path} HTTP/1.1\r\n`
          + `Host: ${this.host}:${this.port}\r\n`
          + 'Upgrade: websocket\r\n'
          + 'Connection: Upgrade\r\n'
          + `Sec-WebSocket-Key: ${key}\r\n`
          + 'Sec-WebSocket-Version: 13\r\n'
          + '\r\n',
        )
      })

      const onData = (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk])
        if (!this.handshaken) {
          const end = this.buffer.indexOf('\r\n\r\n')
          if (end === -1) return
          const head = this.buffer.slice(0, end).toString('latin1')
          this.buffer = this.buffer.slice(end + 4)
          const lines = head.split('\r\n')
          const status = lines[0] || ''
          if (!/ 101 /.test(` ${status} `)) {
            fail(new Error(`WebSocket 握手失败：${status}`))
            return
          }
          const acceptLine = lines.find(line => /^sec-websocket-accept:/i.test(line))
          const accept = acceptLine ? acceptLine.split(':').slice(1).join(':').trim() : ''
          if (accept !== this.expectedAccept) {
            fail(new Error('WebSocket 握手校验失败'))
            return
          }
          this.handshaken = true
          settled = true
          clearTimeout(timer)
          socket.off('error', fail)
          socket.on('error', error => this.emit('error', error))
          this.emit('open')
          resolve(this)
        }
        this.drainFrames()
      }
      socket.on('data', onData)
      socket.on('close', () => {
        if (this.closed) return
        this.closed = true
        this.emit('close')
      })
    })
  }

  drainFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0]
      const second = this.buffer[1]
      const fin = (first & 0x80) !== 0
      const opcode = first & 0x0f
      const masked = (second & 0x80) !== 0
      let length = second & 0x7f
      let offset = 2
      if (length === 126) {
        if (this.buffer.length < 4) return
        length = this.buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (this.buffer.length < 10) return
        const high = this.buffer.readUInt32BE(2)
        const low = this.buffer.readUInt32BE(6)
        if (high !== 0) {
          this.terminate(new Error('WebSocket 帧过大'))
          return
        }
        length = low
        offset = 10
      }
      let maskKey = null
      if (masked) {
        if (this.buffer.length < offset + 4) return
        maskKey = this.buffer.slice(offset, offset + 4)
        offset += 4
      }
      if (this.buffer.length < offset + length) return
      let payload = this.buffer.slice(offset, offset + length)
      this.buffer = this.buffer.slice(offset + length)
      if (maskKey !== null) {
        payload = Buffer.from(payload)
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= maskKey[index % 4]
        }
      }
      this.handleFrame(fin, opcode, payload)
    }
  }

  handleFrame(fin, opcode, payload) {
    if (opcode === OP_PING) {
      this.writeFrame(OP_PONG, payload)
      return
    }
    if (opcode === OP_PONG) return
    if (opcode === OP_CLOSE) {
      this.terminate()
      return
    }
    if (opcode === OP_TEXT || opcode === OP_BINARY) {
      if (!fin) {
        this.fragments = [payload]
        this.fragmentOpcode = opcode
        return
      }
      this.deliver(opcode, payload)
      return
    }
    if (opcode === OP_CONT) {
      this.fragments.push(payload)
      if (fin) {
        const joined = Buffer.concat(this.fragments)
        const kind = this.fragmentOpcode
        this.fragments = []
        this.fragmentOpcode = null
        this.deliver(kind, joined)
      }
    }
  }

  deliver(opcode, payload) {
    if (opcode === OP_TEXT) this.emit('message', payload.toString('utf8'))
    else this.emit('binary', payload)
  }

  send(text) {
    if (this.closed || !this.handshaken) throw new Error('WebSocket 未连接')
    this.writeFrame(OP_TEXT, Buffer.from(text, 'utf8'))
  }

  writeFrame(opcode, payload) {
    const length = payload.length
    let header
    if (length < 126) {
      header = Buffer.alloc(6)
      header[1] = 0x80 | length
    } else if (length < 65536) {
      header = Buffer.alloc(8)
      header[1] = 0x80 | 126
      header.writeUInt16BE(length, 2)
    } else {
      header = Buffer.alloc(14)
      header[1] = 0x80 | 127
      header.writeUInt32BE(0, 2)
      header.writeUInt32BE(length, 6)
    }
    header[0] = 0x80 | opcode
    const maskOffset = header.length - 4
    const maskKey = crypto.randomBytes(4)
    maskKey.copy(header, maskOffset)
    const masked = Buffer.allocUnsafe(length)
    for (let index = 0; index < length; index += 1) {
      masked[index] = payload[index] ^ maskKey[index % 4]
    }
    this.socket.write(Buffer.concat([header, masked]))
  }

  terminate(error) {
    if (this.closed) return
    this.closed = true
    try { this.socket?.end() } catch { /* ignore */ }
    try { this.socket?.destroy() } catch { /* ignore */ }
    if (error) this.emit('error', error)
    this.emit('close')
  }

  close() {
    if (this.closed) return
    try { this.writeFrame(OP_CLOSE, Buffer.alloc(0)) } catch { /* ignore */ }
    setTimeout(() => this.terminate(), 200)
  }
}
