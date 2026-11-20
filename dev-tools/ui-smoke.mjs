/**
 * Headless render smoke test for the plugin's React panel.
 * Needs: npm i react react-dom jsdom  (run from a scratch dir, not the profile).
 * Usage: node ui-smoke.mjs   (reads client.js from ../ps5-recorder)
 * It renders the real Page component, checks the sections/buttons, then types a
 * game name through React's handler and asserts the POST /start payload.
 */
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'

const CLIENT = '/Users/oliverli/Desktop/DeepSeek/PS5录制上传方案/ps5-recorder/client.js'
const liveState = await (await fetch('http://127.0.0.1:50891/ps5-recorder-api/state')).json()
liveState.settings.lastGame = ''
liveState.queue = []
liveState.games = {}
liveState.session = null

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:50891/',
  pretendToBeVisual: true,
})
const { window } = dom
global.window = window
global.document = window.document
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true })
global.HTMLElement = window.HTMLElement
global.Node = window.Node
global.getComputedStyle = window.getComputedStyle
global.requestAnimationFrame = cb => setTimeout(cb, 16)
Object.defineProperty(window.document, 'visibilityState', { value: 'visible', configurable: true })

const requests = []
const responses = { '/state': liveState }
window.fetch = async (url, options = {}) => {
  const path = String(url).replace('/ps5-recorder-api', '')
  requests.push({ path, method: options.method ?? 'GET', body: options.body })
  const data = responses[path] ?? { ok: true }
  return {
    ok: true, status: 200,
    json: async () => JSON.parse(JSON.stringify(data)),
    text: async () => JSON.stringify(data),
  }
}
window.open = () => null

let captured = null
window.__ModuleLoader__ = {
  load({ id, factory }) {
    captured = { id, ...factory(name => {
      if (name === 'react') return React
      throw new Error(`unexpected require ${name}`)
    }) }
  },
}

const code = await readFile(CLIENT, 'utf8')
const context = vm.createContext({
  window, document: window.document, fetch: window.fetch,
  setTimeout, clearTimeout, console, URL, URLSearchParams,
})
vm.runInContext(code, context)

const messages = { zh: {}, en: {} }
// locale.register receives the MESSAGES object; capture it for t()
const registrations = []
const ctx = {
  effect(fn) { const cleanup = fn(); return () => { if (typeof cleanup === 'function') cleanup() } },
  locale: {
    register(namespace, table) { Object.assign(messages.zh, table.zh ?? {}); Object.assign(messages.en, table.en ?? {}); return () => {} },
    bind: () => key => messages.zh[key] ?? key,
  },
  slots: {
    inject(owner, factory) { factory() },
    register(options, component) { registrations.push({ options, component }); return () => {} },
  },
}
captured.apply(ctx)
console.log('registered:', registrations.map(r => r.options.name ?? r.options.id))

const page = registrations.find(r => r.options.name === 'main')
const root = createRoot(document.getElementById('root'))
const errors = []
const originalError = console.error
console.error = (...args) => { errors.push(args.join(' ')); originalError(...args) }
root.render(React.createElement(page.component, { t: key => messages.zh[key] ?? key }))
await new Promise(r => setTimeout(r, 1200))

const text = document.body.textContent
const checks = {
  title: text.includes('PS5 录制'),
  startButton: text.includes('开始录制'),
  prepareButton: text.includes('准备 OBS'),
  queueSection: text.includes('上传队列'),
  settingsSection: text.includes('设置'),
  captureRow: text.includes('采集卡'),
  stateFetched: requests.some(r => r.path === '/state'),
}
console.log('render checks:', checks)
console.log('buttons:', [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean).slice(0, 20))
console.log('errors:', errors.length ? errors.slice(0, 3) : 'none')

// type a game name and press Start recording
const gameInput = document.querySelector('input.pr-input')
if (gameInput) {
  const propsKey = Object.keys(gameInput).find(key => key.startsWith('__reactProps$'))
  const reactProps = gameInput[propsKey]
  reactProps.onChange({ target: { value: 'GTA VI' } })
  await new Promise(r => setTimeout(r, 300))
  console.log('input value:', gameInput.value, '| preview:', document.querySelector('.pr-preview-title')?.textContent)
}
const startButton = [...document.querySelectorAll('button')].find(b => b.textContent.includes('开始录制'))
console.log('start button disabled after typing:', startButton?.disabled)
const buttonPropsKey = Object.keys(startButton ?? {}).find(key => key.startsWith('__reactProps$'))
if (startButton && startButton.disabled === false) {
  startButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  if (!requests.some(r => r.path === '/start')) startButton[buttonPropsKey]?.onClick?.()
}
await new Promise(r => setTimeout(r, 300))
const startRequest = requests.find(r => r.path === '/start')
console.log('start request:', startRequest)
const ok = Object.values(checks).every(Boolean) && startRequest && JSON.parse(startRequest.body ?? '{}').game === 'GTA VI'
console.log(ok ? 'UI SMOKE TEST OK' : 'UI SMOKE TEST FAILED')
process.exit(ok ? 0 : 1)
