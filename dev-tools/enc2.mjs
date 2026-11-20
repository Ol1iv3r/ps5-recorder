import { connectOBS, sleep } from '../lib/obs.mjs'
const { client } = await connectOBS({ timeoutMs: 20000 })
for (const enc of ['com.apple.videotoolbox.videoencoder.h264', 'com.apple.videotoolbox.videoencoder.ave.avc']) {
  await client.setProfileParameter('AdvOut', 'RecEncoder', enc)
  await client.startRecord()
  await sleep(600)
  await client.stopRecord()
  await sleep(600)
  const st = await client.getRecordStatus()
  console.log('enc tried:', enc, 'status active:', st.outputActive)
}
await client.close()
