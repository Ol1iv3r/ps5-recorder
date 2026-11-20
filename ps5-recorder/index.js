/**
 * PS5 录制 + YouTube 自动上传 — Host 半。
 *
 * 职责：
 *  1. 通过 obs-websocket v5 控制 OBS：一键开始 / 暂停 / 继续 / 停止；
 *  2. 停止后把 OBS 的 MKV 无损转封装成 MP4，并按「游戏 | EP 01」重命名；
 *  3. 把成片放进上传队列，自动调用 YouTube Data API 上传（可重试、断点续传）；
 *  4. 向浏览器面板暴露一个小型 HTTP API（/ps5-recorder-api/*）。
 *
 * 所有状态保存在 ~/.dsh/ps5-recorder/state.json，令牌在 youtube-tokens.json（0600）。
 */
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  connectOBS, obsRunning, readObsSocketConfig, sleep, waitForObsReady,
} from './lib/obs.mjs'
import {
  buildDescription, buildTitle, finalizeRecording, probeMedia, resolveFfmpeg,
} from './lib/pipeline.mjs'
import {
  DEFAULT_SETTINGS, clearTokens, readState, readTokens, writeState, writeTokens,
} from './lib/store.mjs'
import { YouTubeClient } from './lib/youtube.mjs'

const ROUTE = '/ps5-recorder-api'
const POLL_MS = 2000

const log = (...args) => console.log('[ps5-recorder]', ...args)

/** Everything the browser panel needs; no secrets leave the process. */
function publicState(ctx) {
  const { state, obs, session, youtube, queue, obsError } = ctx
  const settings = state.settings
  return {
    ok: true,
    version: '0.1.0',
    now: Date.now(),
    settings: {
      ...settings,
      googleClientSecret: undefined,
      googleClientSecretSet: Boolean(settings.googleClientSecret),
    },
    games: state.games,
    queue,
    session,
    obs: {
      running: obs?.running ?? false,
      connected: obs?.client?.identified ?? false,
      version: obs?.client?.version ?? '',
      error: obsError ?? '',
      recording: obs?.status?.outputActive ?? false,
      paused: obs?.status?.outputPaused ?? false,
      durationMs: obs?.status?.outputDuration ?? 0,
      timecode: obs?.status?.outputTimecode ?? '00:00:00.000',
      scene: obs?.scene?.name ?? '',
      capture: obs?.capture ?? null,
      audio: obs?.audio ?? null,
    },
    youtube: {
      connected: youtube?.connected ?? false,
      channel: youtube?.channel ?? '',
      channelId: youtube?.channelId ?? '',
      pending: youtube?.pending ?? false,
      error: youtube?.error ?? '',
    },
    ffmpeg: ctx.ffmpeg,
    folder: settings.recordingFolder,
    uploads: { active: ctx.uploadingId ?? '' },
    displayAwake: Boolean(ctx.caffeinate),
  }
}

export const inject = ['webServer']

export function apply(ctx, rawConfig = {}) {
  const runtime = {
    state: null,
    obs: null,
    obsError: '',
    session: null,
    youtube: { connected: false, channel: '', pending: false, error: '' },
    queue: [],
    uploadingId: '',
    uploadAbort: null,
    ffmpeg: { available: false, path: '' },
    booting: null,
    busy: false,
    oauthFlow: null,
    disposed: false,
  }

  /* ------------------------------------------------------------------ */
  /* 状态                                                                */
  /* ------------------------------------------------------------------ */

  const save = () => {
    if (!runtime.state) return Promise.resolve()
    runtime.state.queue = runtime.queue
    return writeState(runtime.state).catch(error => log('保存状态失败', error.message))
  }

  async function boot() {
    runtime.state = await readState()
    // Recover queue entries interrupted by a restart.
    for (const item of runtime.state.queue) {
      if (item.status === 'uploading') {
        item.status = 'queued'
        item.percent = 0
        item.error = ''
      } else if (item.status === 'finalizing') {
        item.status = 'error'
        item.error = '上次整理文件时被中断：请重试，或确认 OBS 里是否留下未处理的 MKV。'
      }
    }
    runtime.queue = runtime.state.queue
    runtime.ffmpeg = { available: Boolean(await resolveFfmpeg()), path: (await resolveFfmpeg()) || '' }
    await mkdir(runtime.state.settings.recordingFolder, { recursive: true }).catch(() => {})
    const tokens = await readTokens()
    runtime._tokens = tokens
    if (tokens?.refresh_token && runtime.state.settings.googleClientId && runtime.state.settings.googleClientSecret) {
      try {
        const client = makeYouTubeClient()
        await client.accessToken()
        const channel = await client.api('/channels?part=snippet&mine=true').catch(() => null)
        runtime.youtube = {
          connected: true,
          channel: channel?.items?.[0]?.snippet?.title ?? '',
          pending: false,
          error: '',
        }
      } catch (error) {
        runtime.youtube = { connected: false, channel: '', pending: false, error: error.message }
      }
    }
    startPolling()
  }

  /* ------------------------------------------------------------------ */
  /* OBS                                                                 */
  /* ------------------------------------------------------------------ */

  async function ensureChannelName() {
    if (!runtime.youtube.connected || (runtime.youtube.channel && runtime.youtube.channelId) || runtime.channelFetching) return
    if (!runtime.state?.settings.googleClientId) return
    runtime.channelFetching = true
    try {
      const tokens = runtime._tokens ?? await readTokens()
      if (!tokens?.refresh_token && !tokens?.access_token) return
      runtime._tokens = tokens
      const client = new YouTubeClient({
        clientId: runtime.state.settings.googleClientId,
        clientSecret: runtime.state.settings.googleClientSecret,
        tokens,
        onTokens: async (value) => { runtime._tokens = value; await writeTokens(value) },
      })
      const channel = await client.api('/channels?part=snippet&mine=true')
      runtime.youtube.channel = channel?.items?.[0]?.snippet?.title ?? ''
      runtime.youtube.channelId = channel?.items?.[0]?.id ?? runtime.youtube.channelId ?? ''
      if (!runtime.youtube.channel) runtime.youtube.channel = '(未命名频道)'
    } catch (error) {
      log('读取频道名失败', error.message)
    } finally {
      runtime.channelFetching = false
    }
  }

  function makeYouTubeClient() {
    const settings = runtime.state.settings
    return new YouTubeClient({
      clientId: settings.googleClientId,
      clientSecret: settings.googleClientSecret,
      tokens: runtime._tokens ?? null,
      onTokens: async (tokens) => {
        runtime._tokens = tokens
        await writeTokens(tokens)
      },
    })
  }

  async function ensureObs(launch = true) {
    if (runtime.obs?.client?.identified) return runtime.obs
    if (runtime.obsPromise) return runtime.obsPromise
    runtime.obsPromise = (async () => {
      const running = await obsRunning()
      if (!running && !launch) {
        runtime.obs = { running: false, client: null, status: null, capture: null, audio: null }
        return runtime.obs
      }
      const socket = await readObsSocketConfig()
      if (socket && socket.enabled === false) {
        await enableObsWebSocket().catch(error => log('启用 WebSocket 失败', error.message))
      }
      const { client } = await connectOBS({ timeoutMs: 45000, port: socket?.port, password: socket?.password ?? '' })
      runtime.obsError = ''
      const obs = { running: true, client, status: null, capture: null, audio: null, scene: null }
      runtime.obs = obs
      await waitForObsReady(client).catch(error => log('OBS 前端未就绪', error.message))
      client.on('RecordStateChanged', data => void onRecordState(data))
      client.on('disconnected', () => {
        runtime.obsError = 'OBS 连接已断开'
        runtime.obs = { running: false, client: null, status: null, capture: null, audio: null }
        stopKeepAwake()
        const session = runtime.session
        if (session && !session.finalizing) {
          // OBS 崩溃或退出：MKV 仍在磁盘上，稍等确认不会重连后自己收尾。
          setTimeout(() => {
            if (runtime.disposed || runtime.obs?.client?.identified) return
            if (runtime.session !== session || session.finalizing) return
            session.finalizing = true
            runtime.session = null
            log('OBS 中断，尝试收尾已有录制', session.title)
            void finalizeSession(session, session.outputPath)
          }, 4000)
        }
      })
      await refreshObsDetails()
      return obs
    })()
    try {
      return await runtime.obsPromise
    } catch (error) {
      runtime.obsError = error.message
      runtime.obs = { running: await obsRunning().catch(() => false), client: null, status: null, capture: null, audio: null }
      throw error
    } finally {
      runtime.obsPromise = null
    }
  }

  async function refreshObsDetails() {
    const obs = runtime.obs
    if (!obs?.client?.identified) return
    const client = obs.client
    obs.status = await client.getRecordStatus().catch(() => obs.status)
    const scenes = await client.getSceneList().catch(() => null)
    if (scenes) obs.scene = { name: scenes.currentProgramSceneName, list: scenes.scenes.map(scene => scene.sceneName) }
    const inputs = await client.getInputList().catch(() => null)
    if (inputs) {
      const captureInput = inputs.inputs.find(input => String(input.inputKind).includes('avcapture'))
      if (captureInput) {
        const settings = await client.getInputSettings(captureInput.inputName).catch(() => null)
        const deviceName = settings?.inputSettings?.device_name ?? ''
        // The property list only contains devices that are actually plugged in;
        // GetSourceActive stays true even when the card has no signal.
        const props = await client.request('GetInputPropertiesListPropertyItems', {
          inputName: captureInput.inputName,
          propertyName: 'device',
        }).catch(() => null)
        const available = (props?.propertyItems ?? []).filter(item => item.itemValue)
        const connected = deviceName
          ? available.some(item => item.itemName === deviceName)
          : available.length > 0
        obs.capture = {
          name: captureInput.inputName,
          kind: captureInput.inputKind,
          active: connected,
          connected,
          device: deviceName,
          available: available.map(item => item.itemName),
        }
      }
      const audioInputs = inputs.inputs.filter(input => input.inputKind === 'coreaudio_input_capture')
      let audioInput = null
      let audioDeviceId = ''
      let audioDevices = []
      // Prefer an audio input that belongs to the capture card, so we never
      // accidentally unmute the built-in microphone.
      for (const candidate of audioInputs) {
        const settings = await client.getInputSettings(candidate.inputName).catch(() => null)
        const deviceId = settings?.inputSettings?.device_id ?? ''
        const props = await client.request('GetInputPropertiesListPropertyItems', {
          inputName: candidate.inputName,
          propertyName: 'device_id',
        }).catch(() => null)
        const devices = (props?.propertyItems ?? []).filter(item => item.itemValue)
        const cardLike = /USBAudio|UGREEN|Elgato|AVERMEDIA|Capture|HDMI/i.test(deviceId)
          || (obs.capture?.device && deviceId.includes(obs.capture.device))
        if (cardLike || !audioInput) {
          audioInput = candidate
          audioDeviceId = deviceId
          audioDevices = devices
          if (cardLike) break
        }
      }
      if (audioInput) {
        const mute = await client.request('GetInputMute', { inputName: audioInput.inputName }).catch(() => null)
        obs.audio = {
          name: audioInput.inputName,
          muted: Boolean(mute?.inputMuted),
          deviceId: audioDeviceId,
          connected: audioDeviceId ? audioDevices.some(item => item.itemValue === audioDeviceId) : audioDevices.length > 0,
          fromCaptureCard: /USBAudio|UGREEN|Elgato|AVERMEDIA|Capture|HDMI/i.test(audioDeviceId)
            || Boolean(obs.capture?.device && audioDeviceId.includes(obs.capture.device)),
        }
      }
    }
  }

  /** One-time setup: make OBS write MKV/MP4 with the right encoder into our folder. */
  async function ensureAudioInput(client, sceneName) {
    const inputs = (await client.getInputList()).inputs
    let input = inputs.find(item => item.inputKind === 'coreaudio_input_capture')
    if (!input) {
      await client.request('CreateInput', {
        sceneName,
        inputName: '游戏音频',
        inputKind: 'coreaudio_input_capture',
        inputSettings: {},
        sceneItemEnabled: true,
      }).catch(() => {})
      const after = (await client.getInputList()).inputs
      input = after.find(item => item.inputKind === 'coreaudio_input_capture')
    }
    return input ?? null
  }

  async function listAudioDevices(client) {
    const scenes = await client.getSceneList().catch(() => null)
    const sceneName = scenes?.currentProgramSceneName ?? ''
    const input = await ensureAudioInput(client, sceneName)
    if (!input) return { devices: [], current: '', inputName: '' }
    const settings = await client.getInputSettings(input.inputName).catch(() => null)
    const props = await client.request('GetInputPropertiesListPropertyItems', {
      inputName: input.inputName,
      propertyName: 'device_id',
    }).catch(() => null)
    const devices = (props?.propertyItems ?? [])
      .filter(item => item.itemValue && item.itemValue !== 'default')
      .map(item => ({ id: item.itemValue, label: item.itemName }))
    return { devices, current: settings?.inputSettings?.device_id ?? '', inputName: input.inputName }
  }

  /**
   * Raise the OBS hardware encoder quality (recordEncoder.json) so recordings
   * keep the best quality OBS can deliver for the chosen encoder. OBS reads
   * this file when an output starts, so it applies to the next recording.
   */
  async function applyEncoderQuality() {
    const quality = Math.max(1, Math.min(100, Math.round(Number(runtime.state.settings.encoderQuality) || 85)))
    try {
      const base = join(homedir(), 'Library', 'Application Support', 'obs-studio')
      const userIni = await readFile(join(base, 'user.ini'), 'utf8').catch(() => '')
      const profileDir = /\[Basic\][\s\S]*?ProfileDir=([^\r\n]+)/.exec(userIni)?.[1]?.trim()
      if (!profileDir) return
      const file = join(base, 'basic', 'profiles', profileDir, 'recordEncoder.json')
      let data = {}
      try { data = JSON.parse(await readFile(file, 'utf8')) } catch { data = {} }
      data.rate_control = data.rate_control || 'CRF'
      data.quality = quality
      data.bitrate = data.bitrate || 25000
      await writeFile(file, JSON.stringify(data))
    } catch (error) {
      log('写入编码质量失败', error.message)
    }
  }

  async function prepareObs() {
    const obs = await ensureObs(true)
    if (!obs.client?.identified) throw new Error('OBS 未连接')
    const settings = runtime.state.settings
    const client = obs.client
    await mkdir(settings.recordingFolder, { recursive: true }).catch(() => {})
    await applyEncoderQuality()
    await client.setRecordingTarget(settings.recordingFolder, settings.videoFormat, settings.videoEncoder)
    const video = await client.getVideoSettings().catch(() => null)
    const fps = Math.max(1, Math.round(Number(settings.fps) || 60))
    if (video && video.fpsNumerator !== fps) {
      await client.request('SetVideoSettings', { fpsNumerator: fps, fpsDenominator: 1 }).catch(() => {})
    }
    await refreshObsDetails()
    return obs
  }

  function startPolling() {
    const timer = setInterval(() => {
      void (async () => {
        if (runtime.disposed) return
        if (!runtime.obs?.client?.identified) {
          if (await obsRunning().catch(() => false)) {
            await ensureObs(false).catch(() => {})
          }
          return
        }
        try {
          await refreshObsDetails()
        } catch (error) {
          log('刷新 OBS 状态失败', error.message)
        }
        // DSH was restarted while OBS kept recording: adopt the session so Stop
        // still finalizes and uploads instead of losing the recording.
        if (!runtime.session && runtime.obs.status?.outputActive && runtime.state?.lastSession?.stoppedAt === 0) {
          const last = runtime.state.lastSession
          const settings = runtime.state.settings
          runtime.session = {
            game: last.game || settings.lastGame || 'PS5',
            episode: last.episode || 1,
            title: buildTitle({
              game: last.game || settings.lastGame || 'PS5',
              episode: last.episode || 1,
              separator: settings.separator,
              padding: settings.episodePadding,
            }),
            startedAt: last.startedAt || Date.now(),
            outputPath: last.filePath || '',
            previousMute: null,
            audioSource: runtime.obs.audio?.name ?? '',
            finalizing: false,
            recovered: true,
          }
          log('恢复进行中的录制', runtime.session.title)
        }
        const session = runtime.session
        if (session && !session.finalizing && runtime.obs.status && runtime.obs.status.outputActive === false) {
          session.offlineTicks = (session.offlineTicks ?? 0) + 1
          if (session.offlineTicks >= 2) {
            session.finalizing = true
            runtime.session = null
            void finalizeSession(session, session.outputPath)
          }
        } else if (session) {
          session.offlineTicks = 0
        }
      })()
    }, POLL_MS)
    ctx.effect(() => () => clearInterval(timer))
  }

  /* ------------------------------------------------------------------ */
  /* 录制会话                                                            */
  /* ------------------------------------------------------------------ */

  async function startRecording({ game, episode, force = false }) {
    if (runtime.busy) throw new Error('上一个操作还没完成')
    runtime.busy = true
    try {
      const settings = runtime.state.settings
      const cleanGame = String(game || '').trim()
      if (!cleanGame) throw new Error('请先填写游戏英文名，例如 GTA VI')
      const lastEpisode = runtime.state.games[cleanGame]?.episode ?? 0
      const episodeNumber = Math.max(1, Math.floor(Number(episode) || lastEpisode + 1))

      const obs = await prepareObs()
      if (!force) {
        if (!obs.capture) {
          throw new Error('OBS 的场景里没有采集卡来源：请先在 OBS 里添加「视频采集设备」。确认要强制录制可以再点一次「强制开始」。')
        }
        if (obs.capture.active === false) {
          throw new Error(`采集卡「${obs.capture.device || obs.capture.name}」没有信号：请检查 PS5 是否开机、HDMI 是否接到采集卡输入。确认要强制录制可以再点一次「强制开始」。`)
        }
        if (settings.unmuteGameAudio && (!obs.audio || obs.audio.connected === false)) {
          throw new Error('没有检测到可用的游戏音频输入（OBS 的 Mic/Aux 或“音频输入采集”没连上采集卡的音频设备）：先在「设置 › 画面 › 游戏音频输入」里刷新并选择，或确认采集卡音频线/开关。确认要静音录制可以再点一次「强制开始」。')
        }
      }
      if (obs.status?.outputActive) throw new Error('OBS 已经在录制中，请先停止当前录制')

      const title = buildTitle({
        game: cleanGame,
        episode: episodeNumber,
        separator: settings.separator,
        padding: settings.episodePadding,
      })
      const previousMute = obs.audio?.muted ?? null
      if (settings.unmuteGameAudio && obs.audio?.name && obs.audio.connected && obs.audio.fromCaptureCard) {
        await obs.client.request('SetInputMute', { inputName: obs.audio.name, inputMuted: false }).catch(() => {})
      }
      let previousMonitor = null
      if (settings.monitorGameAudio && obs.audio?.name && obs.audio.connected) {
        previousMonitor = await obs.client.request('GetInputAudioMonitorType', { inputName: obs.audio.name })
          .then(data => data.monitorType).catch(() => null)
        await obs.client.request('SetInputAudioMonitorType', {
          inputName: obs.audio.name,
          monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT',
        }).catch(error => log('监听音频失败', error.message))
      }
      await obs.client.startRecord()
      const startedAt = Date.now()
      let outputPath = ''
      const deadline = Date.now() + 8000
      while (Date.now() < deadline) {
        const status = await obs.client.getRecordStatus().catch(() => null)
        if (status?.outputActive) {
          outputPath = status.outputPath || ''
          break
        }
        await sleep(150)
      }
      runtime.session = {
        game: cleanGame,
        episode: episodeNumber,
        title,
        startedAt,
        outputPath,
        previousMute,
        previousMonitor,
        audioSource: obs.audio?.name ?? '',
        finalizing: false,
      }
      runtime.state.settings.lastGame = cleanGame
      runtime.state.lastSession = {
        game: cleanGame,
        episode: episodeNumber,
        startedAt,
        stoppedAt: 0,
        filePath: '',
      }
      startKeepAwake()
      await save()
      log('开始录制', title, outputPath)
      return { title, episode: episodeNumber, outputPath }
    } finally {
      runtime.busy = false
    }
  }

  async function stopRecording() {
    if (runtime.busy) throw new Error('上一个操作还没完成')
    if (!runtime.session) {
      const obs = await ensureObs(false).catch(() => null)
      if (obs?.client?.identified && obs.status?.outputActive) {
        await obs.client.stopRecord()
        return { stopped: true }
      }
      throw new Error('当前没有正在进行的录制')
    }
    runtime.busy = true
    try {
      const obs = runtime.obs
      const settings = runtime.state.settings
      if (obs?.client?.identified) {
        await obs.client.stopRecord().catch(error => log('停止录制失败', error.message))
      }
      if (settings.restoreMute && runtime.session.audioSource && runtime.session.previousMute !== null) {
        await obs?.client?.request('SetInputMute', {
          inputName: runtime.session.audioSource,
          inputMuted: runtime.session.previousMute,
        }).catch(() => {})
      }
      if (runtime.session.previousMonitor && runtime.session.audioSource) {
        await obs?.client?.request('SetInputAudioMonitorType', {
          inputName: runtime.session.audioSource,
          monitorType: runtime.session.previousMonitor,
        }).catch(() => {})
      }
      stopKeepAwake()
      log('停止录制', runtime.session.title)
      return { stopped: true, title: runtime.session.title }
    } finally {
      runtime.busy = false
    }
  }

  async function togglePause(paused) {
    const obs = runtime.obs
    if (!runtime.session || !obs?.client?.identified) throw new Error('当前没有正在进行的录制')
    const desired = Boolean(paused)
    const status = await obs.client.getRecordStatus()
    if (!status.outputActive) throw new Error('录制已经结束')
    if (status.outputPaused === desired) return { paused: status.outputPaused }
    await obs.client.request('ToggleRecordPause')
    // OBS applies the pause asynchronously; poll until it reports the wanted state.
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await sleep(100)
      const next = await obs.client.getRecordStatus().catch(() => null)
      if (!next) break
      if (next.outputPaused === desired) return { paused: next.outputPaused }
    }
    throw new Error(desired ? 'OBS 没有进入暂停状态' : 'OBS 没有恢复录制')
  }

  async function onRecordState(data) {
    if (!runtime.obs) return
    if (data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED') {
      if (runtime.session) runtime.session.outputPath = data.outputPath ?? runtime.session.outputPath
      return
    }
    if (data.outputState !== 'OBS_WEBSOCKET_OUTPUT_STOPPED') return
    stopKeepAwake()
    const session = runtime.session
    if (!session || session.finalizing) return
    session.finalizing = true
    const outputPath = data.outputPath || session.outputPath
    runtime.session = null
    void finalizeSession(session, outputPath)
  }

  async function findNewestRecording(sinceMs) {
    try {
      const { readdir, stat } = await import('node:fs/promises')
      const folder = runtime.state.settings.recordingFolder
      const names = await readdir(folder)
      const candidates = []
      for (const name of names) {
        if (!/\.(mkv|mp4|mov)$/i.test(name)) continue
        const info = await stat(join(folder, name))
        if (info.mtimeMs >= sinceMs - 5000) candidates.push({ path: join(folder, name), mtime: info.mtimeMs })
      }
      candidates.sort((a, b) => b.mtime - a.mtime)
      return candidates[0]?.path ?? ''
    } catch {
      return ''
    }
  }

  async function finalizeSession(session, outputPath) {
    const settings = runtime.state.settings
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: session.title,
      game: session.game,
      episode: session.episode,
      filePath: outputPath || '',
      thumbPath: '',
      size: 0,
      durationSec: 0,
      status: 'finalizing',
      percent: 0,
      uploadedBytes: 0,
      videoId: '',
      url: '',
      privacyStatus: settings.privacyStatus,
      error: '',
      createdAt: Date.now(),
      finishedAt: 0,
    }
    runtime.queue.unshift(item)
    await save()
    notify(`录制结束：${session.title}`, '正在处理文件…')

    try {
      if (!outputPath) outputPath = await findNewestRecording(session.startedAt)
      if (!outputPath) throw new Error('没有拿到录制文件路径')
      const result = await finalizeRecording({
        sourcePath: outputPath,
        title: session.title,
        outputDir: settings.recordingFolder,
        makeThumbnail: settings.makeThumbnail,
        keepOriginal: settings.keepOriginal,
        onLog: line => log(line),
      })
      item.filePath = result.filePath
      item.thumbPath = result.thumbPath
      item.size = result.size
      item.durationSec = result.durationSec
      item.status = 'queued'
      item.error = ''
      const warnings = []
      if (!result.hasAudio) warnings.push('这段录像没有音轨')
      else if (result.loudness?.maxDb !== null && result.loudness?.maxDb !== undefined && result.loudness.maxDb < -50) {
        warnings.push(`这段录像几乎没有声音（最大音量 ${result.loudness.maxDb} dB），请检查 OBS 里的游戏音频`)
      }
      item.warning = warnings.join('；')
      runtime.state.games[session.game] = {
        ...(runtime.state.games[session.game] ?? {}),
        episode: Math.max(runtime.state.games[session.game]?.episode ?? 0, session.episode),
      }
      runtime.state.lastSession = {
        game: session.game,
        episode: session.episode,
        startedAt: session.startedAt,
        stoppedAt: Date.now(),
        filePath: result.filePath,
      }
      await save()
      notify(`已就绪：${session.title}`, item.warning || '文件已整理，等待你确认后上传')
      if (settings.autoUpload) {
        await sleep(Math.max(0, settings.uploadDelaySeconds) * 1000)
        void processQueue()
      }
    } catch (error) {
      item.status = 'error'
      item.error = error.message
      item.filePath = outputPath || item.filePath
      await save()
      notify(`处理失败：${session.title}`, error.message)
      log('处理录制失败', error)
    }
  }

  /* ------------------------------------------------------------------ */
  /* 上传                                                                */
  /* ------------------------------------------------------------------ */

  async function processQueue() {
    if (runtime.uploadingId) return
    const next = runtime.queue.find(item => item.status === 'queued')
    if (!next) return
    if (!runtime.state.settings.googleClientId || !runtime.state.settings.googleClientSecret) {
      runtime.youtube.error = '还没有配置 Google OAuth 客户端（见设置页）'
      return
    }
    if (!runtime.youtube.connected) {
      runtime.youtube.error = '需要先连接 YouTube 账号'
      return
    }
    runtime.uploadingId = next.id
    next.status = 'uploading'
    next.percent = 0
    next.error = ''
    await save()
    const controller = new AbortController()
    runtime.uploadAbort = controller
    try {
      const settings = runtime.state.settings
      const tokens = runtime._tokens ?? await (async () => {
        const stored = await readTokens()
        runtime._tokens = stored
        return stored
      })()
      const client = new YouTubeClient({
        clientId: settings.googleClientId,
        clientSecret: settings.googleClientSecret,
        tokens,
        onTokens: async (value) => { runtime._tokens = value; await writeTokens(value) },
      })
      const playlistId = runtime.state.games[next.game]?.playlistId || settings.playlistId || ''
      const description = buildDescription(settings.descriptionTemplate, {
        game: next.game,
        episode: next.episode,
        title: next.title,
        durationSec: next.durationSec,
      })
      notify(`开始上传：${next.title}`, `${(next.size / 1024 / 1024).toFixed(0)} MB`)
      const video = await client.uploadVideo({
        filePath: next.filePath,
        title: next.title,
        description,
        tags: settings.tags,
        privacyStatus: settings.privacyStatus,
        categoryId: settings.categoryId,
        playlistId,
        thumbnailPath: settings.makeThumbnail ? next.thumbPath : '',
        signal: controller.signal,
        onProgress: (progress) => {
          next.percent = progress.percent
          next.uploadedBytes = progress.uploaded
        },
      })
      next.status = 'done'
      next.percent = 100
      next.videoId = video.id ?? ''
      next.url = video.url ?? ''
      next.finishedAt = Date.now()
      next.error = [video.playlistError ? `播放列表未添加：${video.playlistError}` : '', video.thumbnailError ? `封面未设置：${video.thumbnailError}` : '']
        .filter(Boolean).join('；')
      runtime.youtube.connected = true
      if (video.thumbnailError && next.thumbPath && next.videoId) {
        scheduleThumbnailRetry(next, 60_000, 3)
      }
      notify(`上传完成：${next.title}`, video.url || '已上传到 YouTube', studioUrl())
    } catch (error) {
      next.status = error.name === 'AbortError' ? 'canceled' : 'error'
      next.error = error.message
      if (error.status === 401 || /授权已过期|invalid_grant/.test(error.message)) {
        runtime.youtube.connected = false
        runtime.youtube.error = error.message
        await clearTokens().catch(() => {})
        runtime._tokens = null
      }
      log('上传失败', error)
      notify(`上传失败：${next.title}`, error.message)
    } finally {
      runtime.uploadAbort = null
      runtime.uploadingId = ''
      await save()
      void processQueue()
    }
  }

  async function connectYouTube() {
    const settings = runtime.state.settings
    if (!settings.googleClientId || !settings.googleClientSecret) {
      throw new Error('请先在设置里填写 Google OAuth 客户端 ID 和 Secret（见插件详情页的图文步骤）')
    }
    if (runtime.oauthFlow) throw new Error('已经有一个授权窗口在进行中')
    const flow = makeYouTubeClient()
    const { url, complete } = await flow.beginAuthorization()
    runtime.oauthFlow = flow
    runtime.youtube.pending = true
    runtime.youtube.error = ''
    void complete
      .then(async (tokens) => {
        runtime._tokens = tokens
        runtime.oauthFlow = null
        runtime.youtube.pending = false
        runtime.youtube.connected = true
        const channel = await flow.api('/channels?part=snippet&mine=true').catch(() => null)
        runtime.youtube.channel = channel?.items?.[0]?.snippet?.title ?? ''
        runtime.youtube.channelId = channel?.items?.[0]?.id ?? runtime.youtube.channelId ?? ''
        notify('YouTube 已连接', runtime.youtube.channel || '授权成功')
        void processQueue()
      })
      .catch((error) => {
        runtime.oauthFlow = null
        runtime.youtube.pending = false
        runtime.youtube.connected = false
        runtime.youtube.error = error.message
      })
    return { url }
  }

  function cancelYouTube() {
    runtime.oauthFlow?.cancelAuthorization()
    runtime.youtube.pending = false
  }

  async function disconnectYouTube() {
    await clearTokens().catch(() => {})
    runtime._tokens = null
    runtime.youtube = { connected: false, channel: '', pending: false, error: '' }
  }

  /* ------------------------------------------------------------------ */
  /* 通知 / 打开文件                                                      */
  /* ------------------------------------------------------------------ */

  function scheduleThumbnailRetry(item, delayMs, attemptsLeft) {
    const timer = setTimeout(async () => {
      if (runtime.disposed || attemptsLeft <= 0) return
      try {
        const tokens = runtime._tokens ?? await readTokens()
        if (!tokens) return
        const client = new YouTubeClient({
          clientId: runtime.state.settings.googleClientId,
          clientSecret: runtime.state.settings.googleClientSecret,
          tokens,
          onTokens: async (value) => { runtime._tokens = value; await writeTokens(value) },
        })
        await client.setThumbnail(item.videoId, item.thumbPath)
        item.error = item.error
          .split('；')
          .filter(part => !part.startsWith('封面未设置'))
          .join('；')
        await save()
        log('封面补传成功', item.title)
      } catch (error) {
        log('封面补传失败', error.message)
        if (attemptsLeft > 1) scheduleThumbnailRetry(item, delayMs * 2, attemptsLeft - 1)
      }
    }, delayMs)
    timer.unref?.()
  }

  const STUDIO_FALLBACK = 'https://studio.youtube.com'
  const TERMINAL_NOTIFIER = ['/opt/homebrew/bin/terminal-notifier', '/usr/local/bin/terminal-notifier']

  function studioUrl() {
    const channelId = runtime.youtube?.channelId
    if (!channelId) return STUDIO_FALLBACK
    return `https://studio.youtube.com/channel/${channelId}/videos/upload?filter=%5B%5D&sort=%7B%22columnType%22%3A%22date%22%2C%22sortOrder%22%3A%22DESCENDING%22%7D`
  }

  /**
   * macOS banner. With terminal-notifier installed the banner is clickable and
   * opens `openUrl`; otherwise fall back to osascript (banner only).
   */
  function notify(title, body, openUrl = '') {
    if (!runtime.state?.settings) return
    const safe = text => String(text).replace(/["\\]/g, ' ').slice(0, 200)
    const notifier = TERMINAL_NOTIFIER.find(candidate => existsSync(candidate))
    if (notifier) {
      const args = ['-title', safe(title), '-message', safe(body), '-group', 'ps5-recorder']
      if (openUrl) args.push('-open', openUrl)
      execFile(notifier, args, (error) => {
        if (error) {
          execFile('/usr/bin/osascript', ['-e',
            `display notification "${safe(body)}" with title "${safe(title)}"`,
          ], () => {})
        }
      })
      return
    }
    execFile('/usr/bin/osascript', ['-e',
      `display notification "${safe(body)}" with title "${safe(title)}"`,
    ], () => {})
  }

  function startKeepAwake() {
    if (!runtime.state?.settings.keepAwake) return
    if (runtime.caffeinate) return
    try {
      runtime.caffeinate = spawn('/usr/bin/caffeinate', ['-d', '-i', '-s'], { stdio: 'ignore' })
      runtime.caffeinate.on('exit', () => { runtime.caffeinate = null })
      log('已阻止电脑熄屏（caffeinate pid', runtime.caffeinate.pid, '）')
    } catch (error) {
      log('caffeinate 启动失败', error.message)
    }
  }

  function stopKeepAwake() {
    if (!runtime.caffeinate) return
    try { runtime.caffeinate.kill() } catch { /* ignore */ }
    runtime.caffeinate = null
  }

  function openFolder(folder) {
    if (!folder) return
    execFile('/usr/bin/open', [folder], () => {})
  }

  async function revealFile(filePath) {
    if (!filePath || !existsSync(filePath)) return
    execFile('/usr/bin/open', ['-R', filePath], () => {})
  }

  /* ------------------------------------------------------------------ */
  /* HTTP API                                                            */
  /* ------------------------------------------------------------------ */

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const path = url.pathname.startsWith(ROUTE) ? url.pathname.slice(ROUTE.length) || '/' : url.pathname
    // 本地接口没有登录态：只接受来自本机页面的调用。
    const origin = req.headers.origin
    if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
      respondJson(res, 403, { ok: false, error: 'forbidden origin' })
      return
    }
    try {
      if (!runtime.state && runtime.booting) await runtime.booting
      if (req.method === 'GET' && (path === '/' || path === '/state')) {
        // Refresh on demand so a button press is reflected by the next poll
        // instead of waiting for the background tick.
        if (runtime.youtube.connected && (!runtime.youtube.channel || !runtime.youtube.channelId)) await ensureChannelName()
        if (runtime.obs?.client?.identified && Date.now() - (runtime.lastRefresh ?? 0) > 700) {
          runtime.lastRefresh = Date.now()
          await refreshObsDetails().catch(() => {})
        }
        respondJson(res, 200, publicState(runtime))
        return
      }
      if (req.method === 'POST' && path === '/settings') {
        const body = await readJsonBody(req)
        const settings = runtime.state.settings
        for (const [key, value] of Object.entries(body ?? {})) {
          if (key === 'googleClientSecret') {
            if (typeof value === 'string') settings.googleClientSecret = value.trim()
            continue
          }
          if (key === 'googleClientId' && typeof value === 'string') {
            settings.googleClientId = value.trim()
            continue
          }
          if (!(key in DEFAULT_SETTINGS)) continue
          const expected = DEFAULT_SETTINGS[key]
          if (Array.isArray(expected)) {
            settings[key] = Array.isArray(value)
              ? value.map(item => String(item).trim()).filter(Boolean)
              : String(value).split(',').map(item => item.trim()).filter(Boolean)
            continue
          }
          if (typeof expected === 'number') {
            const number = Number(value)
            if (Number.isFinite(number)) settings[key] = number
            continue
          }
          if (typeof expected === 'boolean') {
            settings[key] = Boolean(value)
            continue
          }
          if (typeof value === 'string') settings[key] = value
        }
        await mkdir(settings.recordingFolder, { recursive: true }).catch(() => {})
        await save()
        if (runtime.obs?.client?.identified) await refreshObsDetails().catch(() => {})
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/start') {
        const body = await readJsonBody(req)
        const result = await startRecording({
          game: body.game,
          episode: body.episode,
          force: Boolean(body.force),
        })
        respondJson(res, 200, { ok: true, ...result })
        return
      }
      if (req.method === 'POST' && path === '/stop') {
        const result = await stopRecording()
        respondJson(res, 200, { ok: true, ...result })
        return
      }
      if (req.method === 'POST' && path === '/pause') {
        const body = await readJsonBody(req)
        const result = await togglePause(Boolean(body.paused))
        respondJson(res, 200, { ok: true, ...result })
        return
      }
      if (req.method === 'POST' && path === '/prepare') {
        const obs = await prepareObs()
        respondJson(res, 200, {
          ok: true,
          capture: obs.capture,
          audio: obs.audio,
          folder: runtime.state.settings.recordingFolder,
        })
        return
      }
      if (req.method === 'POST' && path === '/devices') {
        const obs = await ensureObs(true)
        const inputs = await obs.client.getInputList()
        const videoInput = inputs.inputs.find(input => String(input.inputKind).includes('avcapture'))
        let devices = []
        if (videoInput) {
          const list = await obs.client.request('GetInputPropertiesListPropertyItems', {
            inputName: videoInput.inputName,
            propertyName: 'device',
          }).catch(() => null)
          devices = (list?.propertyItems ?? []).filter(item => item.itemValue).map(item => ({ value: item.itemValue, label: item.itemName }))
        }
        respondJson(res, 200, { ok: true, devices, current: obs.capture?.device ?? '' })
        return
      }
      if (req.method === 'POST' && path === '/audio-devices') {
        const obs = await ensureObs(true)
        const result = await listAudioDevices(obs.client)
        respondJson(res, 200, { ok: true, ...result })
        return
      }
      if (req.method === 'POST' && path === '/audio-device') {
        const body = await readJsonBody(req)
        if (!body.deviceId) throw new Error('缺少音频设备 ID')
        const obs = await ensureObs(true)
        const sceneName = obs.scene?.name ?? (await obs.client.getSceneList()).currentProgramSceneName
        const input = await ensureAudioInput(obs.client, sceneName)
        if (!input) throw new Error('无法创建音频输入源')
        await obs.client.setInputSettings(input.inputName, { device_id: String(body.deviceId) })
        await obs.client.request('SetInputMute', { inputName: input.inputName, inputMuted: false }).catch(() => {})
        await sleep(800)
        await refreshObsDetails()
        respondJson(res, 200, { ok: true, audio: obs.audio })
        return
      }
      if (req.method === 'POST' && path === '/device') {
        const body = await readJsonBody(req)
        const obs = await ensureObs(true)
        const inputs = await obs.client.getInputList()
        const videoInput = inputs.inputs.find(input => String(input.inputKind).includes('avcapture'))
        if (!videoInput) throw new Error('OBS 里没有采集卡来源')
        if (!body.value) throw new Error('缺少设备 ID')
        await obs.client.setInputSettings(videoInput.inputName, {
          device: String(body.value),
          ...(body.label ? { device_name: String(body.label) } : {}),
        })
        await sleep(1200)
        await refreshObsDetails()
        respondJson(res, 200, { ok: true, capture: obs.capture })
        return
      }
      if (req.method === 'POST' && path === '/youtube/connect') {
        const result = await connectYouTube()
        respondJson(res, 200, { ok: true, ...result })
        return
      }
      if (req.method === 'POST' && path === '/youtube/cancel') {
        cancelYouTube()
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/youtube/disconnect') {
        await disconnectYouTube()
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/youtube/playlists') {
        const client = makeYouTubeClient()
        const playlists = await client.listPlaylists()
        respondJson(res, 200, { ok: true, playlists })
        return
      }
      if (req.method === 'POST' && path === '/queue/upload') {
        const body = await readJsonBody(req)
        const item = runtime.queue.find(entry => entry.id === body.id)
        if (!item) throw new Error('没有这条队列记录')
        if (item.status !== 'done') {
          item.status = 'queued'
          item.error = ''
          item.percent = 0
          await save()
          void processQueue()
        }
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/queue/retry') {
        const body = await readJsonBody(req)
        const item = runtime.queue.find(entry => entry.id === body.id)
        if (!item) throw new Error('没有这条队列记录')
        item.status = 'queued'
        item.error = ''
        item.percent = 0
        await save()
        void processQueue()
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/queue/remove') {
        const body = await readJsonBody(req)
        runtime.queue = runtime.queue.filter(entry => entry.id !== body.id)
        await save()
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/queue/cancel') {
        runtime.uploadAbort?.abort()
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/episode') {
        const body = await readJsonBody(req)
        const game = String(body.game ?? '').trim()
        if (!game) throw new Error('缺少游戏名')
        const episode = Math.max(0, Math.floor(Number(body.episode) || 0))
        runtime.state.games[game] = { ...(runtime.state.games[game] ?? {}), episode }
        await save()
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/open-folder') {
        openFolder(runtime.state.settings.recordingFolder)
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/reveal') {
        const body = await readJsonBody(req)
        await revealFile(body.path)
        respondJson(res, 200, { ok: true })
        return
      }
      if (req.method === 'POST' && path === '/refresh') {
        await ensureObs(true).catch(error => { runtime.obsError = error.message })
        respondJson(res, 200, publicState(runtime))
        return
      }
      respondJson(res, 404, { ok: false, error: `未知接口 ${req.method} ${path}` })
    } catch (error) {
      log('接口错误', req.method, path, error.message)
      respondJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => { void handle(req, res) },
  }))

  runtime.booting = boot().catch(error => log('初始化失败', error.message))
  ctx.effect(() => () => {
    runtime.disposed = true
    runtime.uploadAbort?.abort()
    stopKeepAwake()
    void runtime.obs?.client?.close?.()
  })

  log('接口', `${ROUTE}/*`)
}

/* -------------------------------------------------------------------- */
/* 工具                                                                  */
/* -------------------------------------------------------------------- */

function respondJson(res, code, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 1024 * 1024) throw new Error('请求体过大')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('请求体不是合法 JSON')
  }
}

async function enableObsWebSocket() {
  const configPath = join(
    homedir(),
    'Library',
    'Application Support',
    'obs-studio',
    'plugin_config',
    'obs-websocket',
    'config.json',
  )
  const { readFile, writeFile } = await import('node:fs/promises')
  const data = JSON.parse(await readFile(configPath, 'utf8'))
  data.server_enabled = true
  await writeFile(configPath, JSON.stringify(data, null, 2))
}
