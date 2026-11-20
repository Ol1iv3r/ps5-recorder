/** Render the shell.overlay upload toast and assert its Studio link. */
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import React from 'react'
import { createRoot } from 'react-dom/client'

const CLIENT = fileURLToPath(new URL('../ps5-recorder/client.js', import.meta.url))
const live = await (await fetch('http://127.0.0.1:50891/ps5-recorder-api/state')).json()
live.queue = [{
  id: 'done-1', title: 'GTA VI | EP 03', status: 'done', videoId: 'abc123', url: 'https://youtu.be/abc123', percent: 100,
  game: 'GTA VI', episode: 3, filePath: '/tmp/x.mp4', thumbPath: '', size: 1, durationSec: 10, uploadedBytes: 1,
  privacyStatus: 'public', error: '', warning: '', createdAt: Date.now(), finishedAt: Date.now(),
}]
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:50891/', pretendToBeVisual: true })
const { window } = dom
global.window = window; global.document = window.document
Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true })
global.HTMLElement = window.HTMLElement; global.getComputedStyle = window.getComputedStyle
global.requestAnimationFrame = cb => setTimeout(cb, 16)
Object.defineProperty(window.document, 'visibilityState', { value: 'visible', configurable: true })
window.localStorage.setItem('ps5-recorder-last-upload', 'old-upload')
window.fetch = async (url) => { const data = String(url).includes('/state') ? live : { ok: true }; return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(data)), text: async () => JSON.stringify(data) } }
window.open = () => null
let captured = null
window.__ModuleLoader__ = { load({ id, factory }) { captured = factory(n => n === 'react' ? React : null) } }
vm.runInContext(await readFile(CLIENT, 'utf8'), vm.createContext({ window, document: window.document, fetch: window.fetch, setTimeout, clearTimeout, console, URL, URLSearchParams }))
const messages = { zh: {} }; const regs = []
const ctx = { effect(fn){const c=fn();return()=>c?.()}, locale:{ register(ns,t){Object.assign(messages.zh,t.zh??{});return()=>{}}, bind:()=>k=>messages.zh[k]??k }, slots:{ inject(o,f){f()}, register(o,c){regs.push({o,c});return()=>{}} } }
captured.apply(ctx)
const reg = regs.find(r => r.o.id === 'ps5-recorder-upload-toast')
console.log('overlay registration:', Boolean(reg), reg?.o.name)
const root = createRoot(document.getElementById('root'))
root.render(React.createElement(reg.c, { t: k => messages.zh[k] ?? k }))
await new Promise(r => setTimeout(r, 2500))
const text = document.body.textContent
console.log('toast text:', text.slice(0, 200))
const link = document.querySelector('.pr-toast-btn[data-primary="true"]')
console.log('studio link:', link?.href)
const expectedChannel = live.youtube?.channelId ?? ''
const expectedStudio = expectedChannel
  ? `https://studio.youtube.com/channel/${expectedChannel}/videos/upload`
  : 'https://studio.youtube.com'
const ok = text.includes('已上传到 YouTube') && text.includes('GTA VI | EP 03') && String(link?.href).startsWith(expectedStudio)
console.log(ok ? 'TOAST SMOKE TEST OK' : 'TOAST SMOKE TEST FAILED')
process.exit(ok ? 0 : 1)
