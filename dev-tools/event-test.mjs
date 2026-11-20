import { connectOBS, sleep } from '../lib/obs.mjs'
const { client } = await connectOBS({ timeoutMs: 20000 })
client.on('RecordStateChanged', data => console.log('RecordStateChanged:', JSON.stringify(data)))
await client.startRecord()
await sleep(1200)
await client.stopRecord()
await sleep(1200)
await client.close()
