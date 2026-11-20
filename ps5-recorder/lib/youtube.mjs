/**
 * YouTube Data API v3 client: OAuth (loopback + PKCE), token refresh, resumable
 * upload, playlist insert and thumbnail set — all with node: builtins only.
 *
 * Google OAuth "Desktop app" clients accept any http://127.0.0.1:<port> loopback
 * redirect, so the plugin starts its own short-lived callback server.
 */
import http from 'node:http'
import crypto from 'node:crypto'
import { open, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos'
const API_URL = 'https://www.googleapis.com/youtube/v3'

export const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
]

export function b64url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function pkcePair() {
  const verifier = b64url(crypto.randomBytes(48))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export class YouTubeError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'YouTubeError'
    this.status = options.status ?? 0
    this.body = options.body
    this.code = options.code
  }
}

/**
 * OAuth authorization-code flow with a one-shot 127.0.0.1 callback server.
 * `url()` resolves once the loopback port is known; `result` settles when the
 * browser comes back with a code.
 */
export function createOAuthFlow({ clientId, timeoutMs = 10 * 60 * 1000 }) {
  const { verifier, challenge } = pkcePair()
  const state = b64url(crypto.randomBytes(16))
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/' && url.pathname !== '/oauth2callback') {
      res.writeHead(404).end('not found')
      return
    }
    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    const returnedState = url.searchParams.get('state')
    const page = (title, body) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><meta charset="utf-8"><title>${title}</title>`
        + '<body style="font-family:-apple-system,system-ui,sans-serif;padding:48px;line-height:1.6">'
        + `<h2>${title}</h2><p>${body}</p></body>`)
    }
    if (error) {
      page('授权失败', `Google 返回：${error}。请回到录制面板重试。`)
      finish(new Error(`Google 授权被拒绝：${error}`))
      return
    }
    if (returnedState !== state) {
      page('授权失败', 'state 校验不通过。请回到插件重试。')
      finish(new Error('OAuth state 校验失败'))
      return
    }
    if (!code) {
      page('授权失败', '没有收到授权码。')
      finish(new Error('没有收到授权码'))
      return
    }
    page('授权成功', '可以关闭此标签页，回到 DeepSeek Harness 的录制面板。')
    finish(null, code)
  })

  let settled = false
  let resolveResult
  let rejectResult
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  let timer = null
  function finish(error, value) {
    if (settled) return
    settled = true
    if (timer) clearTimeout(timer)
    try { server.close() } catch { /* ignore */ }
    if (error) rejectResult(error)
    else resolveResult(value)
  }

  const listening = new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
  timer = setTimeout(() => finish(new Error('YouTube 授权超时，请重试')), timeoutMs)
  server.on('error', error => finish(error))

  return {
    result,
    async url() {
      const port = await listening
      const redirectUri = `http://127.0.0.1:${port}/`
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      })
      return { url: `${AUTH_URL}?${params.toString()}`, redirectUri }
    },
    cancel() {
      finish(new Error('已取消 YouTube 授权'))
    },
    verifier,
    state,
  }
}

async function parseJson(response) {
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return { raw: text } }
}

export class YouTubeClient {
  constructor(options = {}) {
    this.clientId = options.clientId ?? ''
    this.clientSecret = options.clientSecret ?? ''
    this.fetch = options.fetch ?? globalThis.fetch
    this.tokens = options.tokens ?? null
    this.onTokens = options.onTokens ?? (() => {})
    this.flow = null
  }

  get authorized() {
    return Boolean(this.tokens && (this.tokens.refresh_token || this.tokens.access_token))
  }

  /** Build the consent URL; the caller opens it and then awaits `complete`. */
  async beginAuthorization() {
    if (!this.clientId || !this.clientSecret) {
      throw new YouTubeError('还没有填写 Google OAuth 客户端 ID / Secret')
    }
    this.flow = createOAuthFlow({ clientId: this.clientId })
    const { url, redirectUri } = await this.flow.url()
    const complete = (async () => {
      const code = await this.flow.result
      const tokens = await this.exchangeCode(code, redirectUri, this.flow.verifier)
      this.tokens = tokens
      await this.onTokens(tokens)
      return tokens
    })()
    return { url, complete }
  }

  cancelAuthorization() {
    this.flow?.cancel()
  }

  async exchangeCode(code, redirectUri, verifier) {
    const body = new URLSearchParams({
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    })
    const response = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const data = await parseJson(response)
    if (!response.ok || !data?.refresh_token) {
      throw new YouTubeError(`换取 YouTube 授权失败：${data?.error_description || data?.error || response.status}`, {
        status: response.status,
        body: data,
      })
    }
    return {
      ...data,
      refresh_token: data.refresh_token,
      expiry: Date.now() + (Number(data.expires_in) || 3500) * 1000,
    }
  }

  async refresh() {
    if (!this.tokens?.refresh_token) throw new YouTubeError('YouTube 授权已失效，请重新连接')
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.tokens.refresh_token,
      grant_type: 'refresh_token',
    })
    const response = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const data = await parseJson(response)
    if (!response.ok || !data?.access_token) {
      const reason = data?.error === 'invalid_grant'
        ? '授权已过期或被撤销，请重新连接 YouTube'
        : (data?.error_description || data?.error || response.status)
      throw new YouTubeError(`刷新 YouTube 授权失败：${reason}`, { status: response.status, body: data })
    }
    this.tokens = {
      ...this.tokens,
      ...data,
      refresh_token: data.refresh_token || this.tokens.refresh_token,
      expiry: Date.now() + (Number(data.expires_in) || 3500) * 1000,
    }
    await this.onTokens(this.tokens)
    return this.tokens.access_token
  }

  async accessToken(force = false) {
    if (!this.tokens) throw new YouTubeError('还没有连接 YouTube')
    if (!force && this.tokens.access_token && (this.tokens.expiry ?? 0) > Date.now() + 60_000) {
      return this.tokens.access_token
    }
    return this.refresh()
  }

  async api(path, options = {}) {
    const token = await this.accessToken(options.force)
    const response = await this.fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(options.json ? { 'content-type': 'application/json' } : {}),
      },
      body: options.json ? JSON.stringify(options.json) : options.body,
    })
    const data = await parseJson(response)
    if (response.status === 401 && !options.force) {
      return this.api(path, { ...options, force: true })
    }
    if (!response.ok) {
      throw new YouTubeError(`YouTube API 失败：${data?.error?.message || response.status}`, {
        status: response.status,
        body: data,
      })
    }
    return data
  }

  /**
   * Resumable upload with progress. Returns the created video resource.
   * `signal` aborts the upload; YouTube keeps the session alive for later retry.
   */
  async uploadVideo(options) {
    const {
      filePath, title, description = '', tags = [], privacyStatus = 'private',
      categoryId = '20', madeForKids = false, onProgress = () => {}, signal,
      chunkSize = 16 * 1024 * 1024, maxRetries = 4, playlistId = '', thumbnailPath = '',
    } = options
    const info = await stat(filePath)
    const total = info.size
    if (total > 256 * 1024 * 1024 * 1024) throw new YouTubeError('文件超过 YouTube 单视频 256 GB 上限')
    const token = await this.accessToken()

    // YouTube field limits: title 100 chars, description 5000 chars, tags 500 chars total.
    const safeTitle = Array.from(String(title ?? '')).slice(0, 100).join('')
    const safeDescription = String(description ?? '').slice(0, 5000)
    const safeTags = []
    let tagBudget = 500
    for (const tag of tags) {
      const clean = String(tag).trim()
      if (!clean) continue
      if (clean.length + 1 > tagBudget) break
      safeTags.push(clean)
      tagBudget -= clean.length + 1
    }

    const initResponse = await this.fetch(`${UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-length': String(total),
        'x-upload-content-type': 'video/mp4',
      },
      body: JSON.stringify({
        snippet: { title: safeTitle, description: safeDescription, tags: safeTags, categoryId },
        status: { privacyStatus, selfDeclaredMadeForKids: madeForKids },
      }),
    })
    if (!initResponse.ok) {
      const data = await parseJson(initResponse)
      throw new YouTubeError(`创建上传会话失败：${data?.error?.message || initResponse.status}`, {
        status: initResponse.status, body: data,
      })
    }
    const sessionUrl = initResponse.headers.get('location')
    if (!sessionUrl) throw new YouTubeError('YouTube 没有返回上传会话地址')

    const handle = await open(filePath, 'r')
    let uploaded = 0
    const startedAt = Date.now()
    try {
      while (uploaded < total) {
        const size = Math.min(chunkSize, total - uploaded)
        const buffer = Buffer.allocUnsafe(size)
        await handle.read(buffer, 0, size, uploaded)
        let attempt = 0
        let completed = null
        let nextOffset = null
        for (;;) {
          let response
          try {
            response = await this.fetch(sessionUrl, {
              method: 'PUT',
              signal,
              headers: {
                'content-length': String(size),
                'content-range': `bytes ${uploaded}-${uploaded + size - 1}/${total}`,
                'content-type': 'video/mp4',
              },
              body: buffer,
            })
          } catch (error) {
            if (signal?.aborted) throw error
            attempt += 1
            if (attempt > maxRetries) throw new YouTubeError(`上传中断：${error.message}`)
            await delay(1000 * attempt)
            continue
          }
          if (response.status === 308) {
            // Partial: trust the server's Range so a lost chunk is re-sent from
            // exactly the next byte instead of being skipped.
            const match = /bytes=\d+-(\d+)/.exec(response.headers.get('range') ?? '')
            nextOffset = match ? Number(match[1]) + 1 : uploaded
            break
          }
          if (response.ok && (response.status === 200 || response.status === 201)) {
            completed = await parseJson(response)
            break
          }
          if (response.status === 401) {
            await this.refresh()
            continue
          }
          if (response.status === 404 || response.status === 410) {
            throw new YouTubeError('上传会话已失效，请重试整个上传', { status: response.status })
          }
          if (response.status >= 500 || response.status === 429) {
            attempt += 1
            if (attempt > maxRetries) {
              throw new YouTubeError(`YouTube 服务器错误：${response.status}`, { status: response.status })
            }
            await delay(1000 * attempt)
            continue
          }
          const data = await parseJson(response)
          throw new YouTubeError(`上传失败：${data?.error?.message || response.status}`, {
            status: response.status, body: data,
          })
        }
        if (completed) {
          uploaded = total
          onProgress({ uploaded, total, percent: 100, done: true, speed: uploaded / Math.max(1, Date.now() - startedAt) })
          const video = { ...completed, url: completed?.id ? `https://youtu.be/${completed.id}` : '' }
          if (playlistId && completed?.id) {
            try {
              await this.addToPlaylist(completed.id, playlistId)
            } catch (error) {
              video.playlistError = error.message
            }
          }
          if (thumbnailPath && completed?.id) {
            try {
              await this.setThumbnail(completed.id, thumbnailPath)
            } catch (error) {
              video.thumbnailError = error.message
            }
          }
          return video
        }
        if (nextOffset === null) throw new YouTubeError('上传未能完成')
        if (nextOffset <= uploaded) {
          attempt += 1
          if (attempt > maxRetries) {
            throw new YouTubeError('YouTube 没有收到上传数据，请检查网络后重试')
          }
          await delay(1000 * attempt)
          nextOffset = null
          continue
        }
        uploaded = Math.min(nextOffset, total)
        onProgress({
          uploaded,
          total,
          percent: Math.round((uploaded / total) * 100),
          done: uploaded >= total,
          speed: uploaded / Math.max(1, (Date.now() - startedAt) / 1000),
        })
      }
    } finally {
      await handle.close().catch(() => {})
    }
    throw new YouTubeError('上传未能完成')
  }

  async addToPlaylist(videoId, playlistId) {
    return this.api('/playlistItems?part=snippet', {
      method: 'POST',
      json: {
        snippet: {
          playlistId,
          resourceId: { kind: 'youtube#video', videoId },
        },
      },
    })
  }

  async setThumbnail(videoId, thumbnailPath) {
    const info = await stat(thumbnailPath)
    const stream = createReadStream(thumbnailPath)
    const chunks = []
    for await (const chunk of stream) chunks.push(chunk)
    const body = Buffer.concat(chunks)
    return this.api(`/thumbnails/set?videoId=${encodeURIComponent(videoId)}`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', 'content-length': String(info.size) },
      body,
    })
  }

  /** List the channel's playlists so the UI can offer a picker. */
  async listPlaylists() {
    const data = await this.api('/playlists?part=snippet&mine=true&maxResults=50')
    return (data.items ?? []).map(item => ({ id: item.id, title: item.snippet?.title ?? item.id }))
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
