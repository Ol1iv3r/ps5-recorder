/** End-to-end test of the real flow: start -> pause -> resume -> stop -> finalize. */
import http from 'node:http'
import { apply } from '../index.js'

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

async function call(path, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  console.log('->', path, response.status, JSON.stringify(data).slice(0, 400))
  return data
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

await wait(2500)
const before = await call('/state')
console.log('capture:', JSON.stringify(before.obs.capture))
if (!before.obs.connected) { console.log('OBS not connected, abort'); process.exit(1) }

const start = await call('/start', { game: 'GTA VI' })
if (!start?.ok) process.exit(1)
await wait(6000)
let state = await call('/state')
console.log('recording:', state.obs.recording, state.obs.timecode, state.session?.title)
await call('/pause', { paused: true })
await wait(1500)
await call('/pause', { paused: false })
await wait(3000)
await call('/stop')
for (let attempt = 0; attempt < 30; attempt += 1) {
  await wait(1000)
  state = await call('/state')
  const item = state.queue[0]
  if (item && item.status !== 'finalizing') {
    console.log('item:', JSON.stringify(item, null, 1))
    break
  }
}
server.close()
process.exit(0)
