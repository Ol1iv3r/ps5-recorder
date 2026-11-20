import { connectOBS } from '../lib/obs.mjs'
const { client } = await connectOBS({ timeoutMs: 20000 })
const inputs = (await client.getInputList()).inputs
for (const input of inputs) {
  const settings = await client.getInputSettings(input.inputName).catch(() => null)
  const mute = await client.request('GetInputMute', { inputName: input.inputName }).catch(() => null)
  const volume = await client.request('GetInputVolume', { inputName: input.inputName }).catch(() => null)
  console.log(input.inputName, '|', input.inputKind, '| muted:', mute?.inputMuted, '| volume:', volume?.inputVolumeMul, '| settings:', JSON.stringify(settings?.inputSettings))
}
console.log('--- audio devices ---')
try {
  const devices = await client.request('GetInputPropertiesListPropertyItems', { inputName: 'Mic/Aux', propertyName: 'device_id' })
  console.log(JSON.stringify(devices.propertyItems, null, 1))
} catch (error) { console.log('device list failed:', error.message) }
console.log('--- video devices ---')
try {
  const devices = await client.request('GetInputPropertiesListPropertyItems', { inputName: '采集卡设备', propertyName: 'device' })
  console.log(JSON.stringify(devices.propertyItems, null, 1))
} catch (error) { console.log('video list failed:', error.message) }
await client.close()
