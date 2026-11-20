import http from 'node:http'
import { apply } from '../index.js'
import { connectOBS } from '../lib/obs.mjs'

const routes = []
const ctx = { effect(fn) { fn(); return () => {} }, webServer: { register(o) { routes.push(o); return () => {} } } }
apply(ctx, {})
const server = http.createServer((req, res) => { const r = routes.find(i => req.url.startsWith(i.path)); if (!r) { res.writeHead(404).end(); return } void r.handler(req, res) })
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}${routes[0].path}`
const post = async (path, body) => {
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  return response.json()
}
await new Promise(r => setTimeout(r, 2000))
const state1 = await fetch(base + '/state').then(r => r.json())
console.log('before:', state1.obs.recording, state1.obs.timecode)
console.log('stop:', await post('/stop'))
for (let i = 0; i < 40; i += 1) {
  await new Promise(r => setTimeout(r, 1000))
  const state = await fetch(base + '/state').then(r => r.json())
  const item = state.queue[0]
  if (item && item.status !== 'finalizing') {
    console.log('queue item:', JSON.stringify(item, null, 1))
    console.log('youtube error:', state.youtube.error)
    break
  }
  if (i % 5 === 0) console.log('waiting…', item?.status)
}
server.close()
process.exit(0)
