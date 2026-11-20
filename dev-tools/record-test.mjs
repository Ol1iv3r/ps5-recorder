import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { connectOBS, sleep } from '../lib/obs.mjs'

const folder = join(homedir(), 'Movies', 'PS5')
await mkdir(folder, { recursive: true })

const { client } = await connectOBS({ timeoutMs: 20000 })
const events = []
client.on('event', event => events.push(event.eventType))

const mode = await client.getProfileParameter('Output', 'Mode')
console.log('mode', mode)
console.log('set target:', await client.setRecordingTarget(folder, 'mkv', 'com.apple.videotoolbox.videoencoder.ave.avc'))
console.log('format now:', await client.getProfileParameter('AdvOut', 'RecFormat2'))
console.log('encoder now:', await client.getProfileParameter('AdvOut', 'RecEncoder'))
console.log('path now:', await client.getProfileParameter('AdvOut', 'RecFilePath'))

// 60 fps for PS5 gameplay
await client.request('SetVideoSettings', { fpsNumerator: 60, fpsDenominator: 1 }).catch(error => console.log('fps set failed:', error.message))
const video = await client.getVideoSettings()
console.log('fps now:', video.fpsNumerator, video.fpsDenominator)

await client.startRecord()
await sleep(2500)
let status = await client.getRecordStatus()
console.log('after start:', status)
await client.togglePause()
await sleep(1000)
status = await client.getRecordStatus()
console.log('paused:', status.outputPaused, status.outputTimecode)
await client.togglePause()
await sleep(1800)
status = await client.getRecordStatus()
console.log('resumed:', status.outputPaused, status.outputTimecode)
await client.stopRecord()
await sleep(2500)
status = await client.getRecordStatus()
console.log('after stop:', status)
console.log('events:', events)

const fs = await import('node:fs/promises')
const files = (await fs.readdir(folder)).filter(name => !name.startsWith('.'))
console.log('folder files:', files)
for (const name of files) {
  const info = await stat(join(folder, name))
  console.log(' -', name, info.size, 'bytes')
}
await client.close()
