/**
 * OBS Studio controller over obs-websocket v5 (built into OBS 28+).
 *
 * Zero npm dependencies: uses ./ws.mjs. Reads the websocket port/password from
 * OBS's own config file so the user never has to copy them into the plugin.
 */
import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import crypto from 'node:crypto'
import { WebSocketClient } from './ws.mjs'

export const OBS_CONFIG_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  'obs-studio',
  'plugin_config',
  'obs-websocket',
  'config.json',
)

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Read OBS's obs-websocket config. Returns null when OBS never ran. */
export async function readObsSocketConfig() {
  try {
    const raw = await readFile(OBS_CONFIG_PATH, 'utf8')
    const data = JSON.parse(raw)
    return {
      port: Number(data.server_port) || 4455,
      password: typeof data.server_password === 'string' ? data.server_password : '',
      authRequired: data.auth_required !== false,
      enabled: data.server_enabled !== false,
    }
  } catch {
    return null
  }
}

/** Is the OBS desktop app running? */
export function obsRunning() {
  return new Promise((resolve) => {
    execFile('/usr/bin/pgrep', ['-x', 'OBS'], (error, stdout) => {
      resolve(!error && stdout.trim() !== '')
    })
  })
}

/** Launch OBS (activates the existing app when it is already running). */
export async function launchOBS() {
  await new Promise((resolve, reject) => {
    execFile('/usr/bin/open', ['-a', 'OBS'], (error) => {
      if (error) reject(new Error(`无法启动 OBS：${error.message}`))
      else resolve()
    })
  })
}

function authString(password, salt, challenge) {
  const secret = crypto.createHash('sha256').update(password + salt).digest('base64')
  return crypto.createHash('sha256').update(secret + challenge).digest('base64')
}

export class ObsClient extends EventEmitter {
  constructor(options = {}) {
    super()
    this.port = options.port ?? 4455
    this.password = options.password ?? ''
    this.url = options.url ?? `ws://127.0.0.1:${this.port}`
    this.socket = null
    this.identified = false
    this.requests = new Map()
    this.nextId = 0
    this.closing = false
    this.version = null
  }

  async connect(timeoutMs = 8000) {
    if (this.socket && this.identified) return this
    const socket = new WebSocketClient(this.url, { connectTimeout: timeoutMs })
    this.socket = socket
    await socket.connect()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OBS WebSocket 认证超时')), timeoutMs)
      const done = (error) => {
        clearTimeout(timer)
        socket.off('message', onMessage)
        if (error) reject(error)
        else resolve(this)
      }
      const onMessage = (raw) => {
        let message
        try { message = JSON.parse(raw) } catch { return }
        if (message.op === 0) {
          const hello = message.d ?? {}
          this.version = hello.obsWebSocketVersion
          const auth = hello.authentication
          const payload = { rpcVersion: 1, eventSubscriptions: 0x7ff }
          if (auth && auth.challenge) {
            if (!this.password) {
              done(new Error('OBS 需要密码认证，但本机 OBS WebSocket 配置里没有密码'))
              return
            }
            payload.authentication = authString(this.password, auth.salt, auth.challenge)
          }
          socket.send(JSON.stringify({ op: 1, d: payload }))
          return
        }
        if (message.op === 2) {
          this.identified = true
          this.attachHandlers(socket)
          done()
          return
        }
        if (message.op === 9) {
          done(new Error(`OBS WebSocket 认证失败：${JSON.stringify(message.d)}`))
        }
      }
      socket.on('message', onMessage)
      socket.once('error', error => done(error))
      socket.once('close', () => {
        if (!this.identified) done(new Error('OBS WebSocket 连接被关闭'))
      })
    })
  }

  attachHandlers(socket) {
    socket.removeAllListeners('message')
    socket.removeAllListeners('close')
    socket.on('message', (raw) => {
      let message
      try { message = JSON.parse(raw) } catch { return }
      if (message.op === 7) {
        const pending = this.requests.get(message.d?.requestId)
        if (!pending) return
        this.requests.delete(message.d.requestId)
        const status = message.d.requestStatus ?? {}
        if (status.result === false) {
          const error = new Error(`OBS 请求 ${pending.type} 失败：${status.comment || status.code}`)
          error.code = status.code
          pending.reject(error)
        } else {
          pending.resolve(message.d.responseData ?? {})
        }
        return
      }
      if (message.op === 5) {
        this.emit('event', message.d)
        this.emit(message.d.eventType, message.d.eventData ?? {})
      }
    })
    socket.on('close', () => {
      this.identified = false
      for (const pending of this.requests.values()) pending.reject(new Error('OBS WebSocket 连接已断开'))
      this.requests.clear()
      this.emit('disconnected')
    })
    socket.on('error', error => this.emit('error', error))
  }

  request(requestType, requestData = {}, timeoutMs = 10000) {
    if (!this.socket || !this.identified) return Promise.reject(new Error('OBS 未连接'))
    const requestId = `dsh-${++this.nextId}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(requestId)
        reject(new Error(`OBS 请求 ${requestType} 超时`))
      }, timeoutMs)
      this.requests.set(requestId, {
        type: requestType,
        resolve: (value) => { clearTimeout(timer); resolve(value) },
        reject: (error) => { clearTimeout(timer); reject(error) },
      })
      this.socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }))
    })
  }

  async getRecordStatus() {
    return this.request('GetRecordStatus')
  }

  async startRecord() {
    const status = await this.getRecordStatus()
    if (status.outputActive) return { alreadyActive: true, status }
    await this.request('StartRecord')
    return { alreadyActive: false }
  }

  async stopRecord() {
    const status = await this.getRecordStatus()
    if (!status.outputActive) return { alreadyActive: false }
    await this.request('StopRecord')
    return { alreadyActive: true, path: status.outputPath }
  }

  async togglePause() {
    await this.request('ToggleRecordPause')
    return this.getRecordStatus()
  }

  async setProfileParameter(category, name, value) {
    return this.request('SetProfileParameter', {
      parameterCategory: category,
      parameterName: name,
      parameterValue: String(value),
    })
  }

  async getProfileParameter(category, name) {
    const data = await this.request('GetProfileParameter', {
      parameterCategory: category,
      parameterName: name,
    })
    return data.parameterValue ?? ''
  }

  /**
   * Make OBS write recordings to `folder` in `format` without touching the
   * user's other OBS settings. Handles both Simple and Advanced output modes.
   */
  async setRecordingTarget(folder, format = 'mkv', encoder = '') {
    const mode = await this.getProfileParameter('Output', 'Mode')
    const advanced = mode === 'Advanced'
    if (advanced) {
      await this.setProfileParameter('AdvOut', 'RecFilePath', folder)
      await this.setProfileParameter('AdvOut', 'RecFormat2', format)
      await this.setProfileParameter('AdvOut', 'RecType', 'Standard')
      if (encoder) await this.setProfileParameter('AdvOut', 'RecEncoder', encoder)
      // Split-file recording would turn one session into several files.
      const split = await this.getProfileParameter('AdvOut', 'RecSplitFileType').catch(() => '')
      if (split && split !== 'None') await this.setProfileParameter('AdvOut', 'RecSplitFileType', 'None')
    } else {
      await this.setProfileParameter('SimpleOutput', 'FilePath', folder)
      await this.setProfileParameter('SimpleOutput', 'RecFormat2', format)
      if (encoder) await this.setProfileParameter('SimpleOutput', 'RecEncoder', encoder)
      await this.setProfileParameter('SimpleOutput', 'RecRB', 'false')
    }
    return { advanced, mode }
  }

  async getSceneList() {
    return this.request('GetSceneList')
  }

  async getInputList() {
    return this.request('GetInputList')
  }

  async getInputSettings(inputName) {
    return this.request('GetInputSettings', { inputName })
  }

  async setInputSettings(inputName, inputSettings, overlay = true) {
    return this.request('SetInputSettings', { inputName, inputSettings, overlay })
  }

  async getSourceActive(sourceName) {
    return this.request('GetSourceActive', { sourceName })
  }

  async setCurrentScene(sceneName) {
    return this.request('SetCurrentProgramScene', { sceneName })
  }

  async getVideoSettings() {
    return this.request('GetVideoSettings')
  }

  async close() {
    if (this.closing) return
    this.closing = true
    this.socket?.close()
  }
}

/**
 * obs-websocket accepts requests as soon as the websocket is up, but the
 * frontend profile/output is still loading for a moment after a cold start.
 * Wait until profile-backed requests succeed.
 */
export async function waitForObsReady(client, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      await client.request('GetProfileParameter', { parameterCategory: 'Output', parameterName: 'Mode' })
      await client.request('GetSceneList')
      return true
    } catch (error) {
      lastError = error
      await sleep(600)
    }
  }
  throw new Error(`OBS 还没有准备好：${lastError?.message || '超时'}`)
}

/**
 * Discover the OBS websocket endpoint, launch OBS if needed and connect.
 * `timeoutMs` is the total budget for app launch + handshake.
 */
export async function connectOBS(options = {}) {
  const config = await readObsSocketConfig()
  let settings = {
    port: options.port || config?.port || 4455,
    password: options.password ?? config?.password ?? '',
  }
  const alreadyRunning = await obsRunning()
  if (!alreadyRunning) {
    await launchOBS()
    await sleep(1500)
    const fresh = await readObsSocketConfig()
    if (fresh) settings = { port: options.port || fresh.port, password: options.password ?? fresh.password }
  }
  const deadline = Date.now() + (options.timeoutMs ?? 30000)
  let lastError = null
  while (Date.now() < deadline) {
    const client = new ObsClient(settings)
    try {
      await client.connect(4000)
      return { client, launched: !alreadyRunning }
    } catch (error) {
      lastError = error
      await client.close().catch(() => {})
      await sleep(900)
    }
  }
  throw new Error(
    `连接 OBS 失败：${lastError?.message || '超时'}。请确认 OBS 已打开，且「工具 › WebSocket 服务器设置」中启用了服务器。`,
  )
}

export function recordingFolderDefault() {
  const candidate = join(homedir(), 'Movies', 'PS5')
  return existsSync(candidate) ? candidate : join(homedir(), 'Movies', 'PS5')
}
