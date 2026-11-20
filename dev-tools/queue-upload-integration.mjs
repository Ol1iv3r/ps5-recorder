/**
 * End-to-end integration test of the Host half's upload orchestration, with a
 * mock YouTube API (no Google credentials / network needed).
 * Runs isolated state under a temp DSH_HOME.
 */
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'

const testHome = path.join(os.tmpdir(), 'ps5-recorder-test-home')
await rm(testHome, { recursive: true, force: true })
await mkdir(path.join(testHome, 'ps5-recorder'), { recursive: true })
process.env.DSH_HOME = testHome

const mediaPath = path.join(testHome, 'GTA VI | EP 02.mp4')
const thumbPath = path.join(testHome, 'GTA VI | EP 02.jpg')
await writeFile(mediaPath, randomBytes(2 * 1024 * 1024 + 12345))
await writeFile(thumbPath, randomBytes(2048))

const queueItem = {
  id: 'test-item-1',
  title: 'GTA VI | EP 02',
  game: 'GTA VI',
  episode: 2,
  filePath: mediaPath,
  thumbPath,
  size: 2 * 1024 * 1024 + 12345,
  durationSec: 120,
  status: 'queued',
  percent: 0,
  uploadedBytes: 0,
  videoId: '',
  url: '',
  privacyStatus: 'unlisted',
  error: '',
  createdAt: Date.now(),
  finishedAt: 0,
}
const settings = {
  enabled: true,
  recordingFolder: testHome,
  separator: ' | ',
  episodePadding: 2,
  videoFormat: 'mkv',
  videoEncoder: 'com.apple.videotoolbox.videoencoder.ave.avc',
  fps: 60,
  autoLaunchObs: false,
  autoUpload: true,
  uploadDelaySeconds: 0,
  privacyStatus: 'unlisted',
  categoryId: '20',
  tags: ['GTA VI', 'PS5'],
  playlistId: 'PL_TEST',
  descriptionTemplate: '本期 {game} EP {episode}',
  makeThumbnail: true,
  unmuteGameAudio: false,
  restoreMute: true,
  keepOriginal: false,
  monitorGameAudio: false,
  googleClientId: 'test-client.apps.googleusercontent.com',
  googleClientSecret: 'test-secret',
  lastGame: 'GTA VI',
}
await writeFile(path.join(testHome, 'ps5-recorder', 'state.json'), JSON.stringify({
  settings, games: { 'GTA VI': { episode: 2, playlistId: '' } }, queue: [queueItem], lastSession: null,
}, null, 2))
await writeFile(path.join(testHome, 'ps5-recorder', 'youtube-tokens.json'), JSON.stringify({
  access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expiry: Date.now() + 3600_000,
}, null, 2))

const calls = []
let chunkIndex = 0
let refreshCount = 0
let receivedBytes = 0
let totalBytes = 0
const realFetch = globalThis.fetch
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json' },
})

globalThis.fetch = async (url, options = {}) => {
  const target = String(url)
  calls.push(`${options.method ?? 'GET'} ${target}`)
  if (target.startsWith('https://oauth2.googleapis.com/token')) {
    refreshCount += 1
    return json({ access_token: `refreshed-token-${refreshCount}`, expires_in: 3600 })
  }
  if (target.includes('/upload/youtube/v3/videos?uploadType=resumable')) {
    return new Response('', { status: 200, headers: { location: 'https://upload.mock/session/1' } })
  }
  if (target === 'https://upload.mock/session/1') {
    chunkIndex += 1
    if (chunkIndex === 1) return new Response('unauthorized', { status: 401 })
    const range = /bytes (\d+)-(\d+)\/(\d+)/.exec(String(options.headers?.['content-range'] ?? ''))
    if (range) {
      totalBytes = Number(range[3])
      const start = Number(range[1])
      const end = Number(range[2])
      // 模拟服务器只收下这一块的一半，要求客户端从下一字节续传
      const accept = chunkIndex === 2 ? Math.floor((end - start + 1) / 2) : end - start + 1
      if (start === receivedBytes) receivedBytes = start + accept
    }
    if (receivedBytes >= totalBytes) return json({ id: 'VIDEO123' }, 201)
    return new Response('', { status: 308, headers: { range: `bytes=0-${receivedBytes - 1}` } })
  }
  if (target.includes('/youtube/v3/playlistItems')) return json({ id: 'PLAYLIST_ITEM' })
  if (target.includes('/youtube/v3/thumbnails/set')) return json({ items: [] })
  if (target.includes('/youtube/v3/channels')) return json({ items: [{ snippet: { title: 'Test Channel' } }] })
  throw new Error(`unexpected fetch: ${target}`)
}

const { apply } = await import('../ps5-recorder/index.js')
const routes = []
const ctx = {
  effect(fn) { const cleanup = fn(); return () => { if (typeof cleanup === 'function') cleanup() } },
  webServer: { register(options) { routes.push(options); return () => {} } },
}
apply(ctx, {})
const server = http.createServer((req, res) => {
  const route = routes.find(item => req.url.startsWith(item.path))
  if (!route) { res.writeHead(404).end(); return }
  void route.handler(req, res)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}${routes[0].path}`
const post = async (path, body = {}) => (await realFetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})).json()
const getState = async () => (await realFetch(base + '/state')).json()
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

await wait(2500)
let state = await getState()
console.log('boot youtube:', state.youtube, '| queue:', state.queue.length)

await post('/queue/upload', { id: 'test-item-1' })
for (let i = 0; i < 40; i += 1) {
  await wait(500)
  state = await getState()
  const item = state.queue[0]
  if (item && (item.status === 'done' || item.status === 'error')) break
}
const item = state.queue[0]
console.log('item status:', item.status, '| percent:', item.percent, '| videoId:', item.videoId, '| url:', item.url)
console.log('item error:', item.error || '(none)')
console.log('youtube state:', state.youtube)
console.log('mock calls:')
for (const call of calls) console.log(' -', call)
console.log('refresh count:', refreshCount)

const ok = item.status === 'done' && item.videoId === 'VIDEO123' && receivedBytes === totalBytes && item.url === 'https://youtu.be/VIDEO123'
  && refreshCount === 1 && calls.some(c => c.includes('playlistItems')) && calls.some(c => c.includes('thumbnails/set'))
server.close()
process.exit(ok ? 0 : 1)
