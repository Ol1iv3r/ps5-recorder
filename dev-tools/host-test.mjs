/** Spin the Host half up with a fake cordis context and exercise the HTTP API. */
import http from 'node:http'
import { apply } from '../index.js'

const routes = []
const ctx = {
  effect(fn) {
    const cleanup = fn()
    return () => { if (typeof cleanup === 'function') cleanup() }
  },
  webServer: {
    register(options) {
      routes.push(options)
      return () => {}
    },
  },
}

apply(ctx, {})
console.log('registered routes:', routes.map(route => `${route.kind} ${route.path}`))

const server = http.createServer((req, res) => {
  const route = routes.find(item => req.url.startsWith(item.path))
  if (!route) { res.writeHead(404).end('no route'); return }
  void route.handler(req, res)
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}${routes[0].path}`
console.log('base', base)
await new Promise(resolve => setTimeout(resolve, 2500))

async function call(path, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = text }
  console.log(`\n=== ${body === undefined ? 'GET' : 'POST'} ${path} -> ${response.status}`)
  console.log(JSON.stringify(data, null, 1).slice(0, 2500))
  return data
}

await call('/state')
await call('/settings', { tags: ['GTA VI', 'PS5'], separator: ' | ', episodePadding: 2 })
await call('/settings', { privacyStatus: 'unlisted', recordingFolder: '/Users/oliverli/Movies/PS5' })
await call('/prepare')
await call('/state')
await call('/devices')
await call('/queue/retry', { id: 'missing' }).catch(() => {})

server.close()
process.exit(0)
