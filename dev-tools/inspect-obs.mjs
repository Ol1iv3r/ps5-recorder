import { connectOBS, readObsSocketConfig, obsRunning } from '../lib/obs.mjs'

const config = await readObsSocketConfig()
console.log('obs config:', config)
console.log('obs running:', await obsRunning())

const { client, launched } = await connectOBS({ timeoutMs: 40000 })
console.log('connected, launched:', launched, 'ws version:', client.version)

const version = await client.request('GetVersion')
console.log('obs version:', version.obsVersion, 'platform:', version.platform)

const mode = await client.getProfileParameter('Output', 'Mode')
console.log('output mode:', mode)

const scenes = await client.getSceneList()
console.log('scenes:', scenes.scenes.map(s => s.sceneName), 'current:', scenes.currentProgramSceneName)

const inputs = await client.getInputList()
console.log('inputs:', inputs.inputs.map(i => `${i.inputName} [${i.inputKind}]`))

const video = await client.getVideoSettings()
console.log('video:', video.baseWidth, video.baseHeight, video.outputWidth, video.outputHeight, video.fpsNumerator, video.fpsDenominator)

const status = await client.getRecordStatus()
console.log('record status:', status)

// Where would OBS write today?
const recPath = mode === 'Advanced'
  ? await client.getProfileParameter('AdvOut', 'RecFilePath')
  : await client.getProfileParameter('SimpleOutput', 'FilePath')
const recFormat = mode === 'Advanced'
  ? await client.getProfileParameter('AdvOut', 'RecFormat2')
  : await client.getProfileParameter('SimpleOutput', 'RecFormat2')
const recEncoder = mode === 'Advanced'
  ? await client.getProfileParameter('AdvOut', 'RecEncoder')
  : await client.getProfileParameter('SimpleOutput', 'RecEncoder')
console.log('recording target:', recPath, recFormat, recEncoder)

await client.close()
