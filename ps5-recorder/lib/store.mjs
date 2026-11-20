/**
 * Local state for the PS5 recorder: settings, per-game episode counters, the
 * upload queue and the YouTube token blob. Stored outside the plugin package so
 * upgrades never touch user data.
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
export const DATA_DIR = join(DSH_HOME, 'ps5-recorder')
export const STATE_PATH = join(DATA_DIR, 'state.json')
export const TOKENS_PATH = join(DATA_DIR, 'youtube-tokens.json')

export const DEFAULT_SETTINGS = {
  enabled: true,
  recordingFolder: join(homedir(), 'Movies', 'PS5'),
  separator: ' | ',
  episodePadding: 2,
  videoFormat: 'mkv',
  videoEncoder: 'com.apple.videotoolbox.videoencoder.ave.avc',
  fps: 60,
  autoLaunchObs: false,
  autoUpload: true,
  uploadDelaySeconds: 2,
  privacyStatus: 'private',
  categoryId: '20',
  tags: [],
  playlistId: '',
  descriptionTemplate: '',
  makeThumbnail: true,
  unmuteGameAudio: true,
  monitorGameAudio: false,
  keepAwake: true,
  restoreMute: true,
  keepOriginal: false,
  googleClientId: '',
  googleClientSecret: '',
  lastGame: '',
}

export const DEFAULT_STATE = {
  settings: { ...DEFAULT_SETTINGS },
  games: {}, // { "GTA VI": { episode: 3, playlistId: "" } }
  queue: [], // finished recordings, newest first
  lastSession: null,
}

function cleanSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS }
  if (!raw || typeof raw !== 'object') return settings
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = raw[key]
    if (value === undefined) continue
    const expected = DEFAULT_SETTINGS[key]
    if (Array.isArray(expected)) {
      if (Array.isArray(value)) settings[key] = value.map(item => String(item)).filter(Boolean)
      continue
    }
    if (typeof expected === 'number') {
      const number = Number(value)
      if (Number.isFinite(number)) settings[key] = number
      continue
    }
    if (typeof expected === 'boolean') {
      if (typeof value === 'boolean') settings[key] = value
      continue
    }
    if (typeof value === 'string') settings[key] = value
  }
  return settings
}

function cleanState(raw) {
  const state = { ...DEFAULT_STATE, settings: cleanSettings(raw?.settings), games: {}, queue: [], lastSession: null }
  if (raw?.games && typeof raw.games === 'object') {
    for (const [game, value] of Object.entries(raw.games)) {
      const episode = Math.max(0, Math.floor(Number(value?.episode) || 0))
      state.games[game] = {
        episode,
        playlistId: typeof value?.playlistId === 'string' ? value.playlistId : '',
      }
    }
  }
  if (Array.isArray(raw?.queue)) {
    state.queue = raw.queue
      .filter(item => item && typeof item === 'object' && typeof item.id === 'string')
      .slice(0, 80)
      .map(item => ({
        id: item.id,
        title: String(item.title ?? ''),
        game: String(item.game ?? ''),
        episode: Math.max(0, Math.floor(Number(item.episode) || 0)),
        filePath: String(item.filePath ?? ''),
        thumbPath: String(item.thumbPath ?? ''),
        size: Number(item.size) || 0,
        durationSec: Number(item.durationSec) || 0,
        status: ['queued', 'uploading', 'done', 'error', 'canceled'].includes(item.status) ? item.status : 'queued',
        percent: Number(item.percent) || 0,
        uploadedBytes: Number(item.uploadedBytes) || 0,
        videoId: typeof item.videoId === 'string' ? item.videoId : '',
        url: typeof item.url === 'string' ? item.url : '',
        privacyStatus: String(item.privacyStatus ?? ''),
        error: typeof item.error === 'string' ? item.error : '',
        warning: typeof item.warning === 'string' ? item.warning : '',
        createdAt: Number(item.createdAt) || Date.now(),
        finishedAt: Number(item.finishedAt) || 0,
      }))
  }
  if (raw?.lastSession && typeof raw.lastSession === 'object') {
    state.lastSession = {
      game: String(raw.lastSession.game ?? ''),
      episode: Math.max(0, Math.floor(Number(raw.lastSession.episode) || 0)),
      startedAt: Number(raw.lastSession.startedAt) || 0,
      stoppedAt: Number(raw.lastSession.stoppedAt) || 0,
      filePath: String(raw.lastSession.filePath ?? ''),
    }
  }
  return state
}

export async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
}

export async function readState() {
  await ensureDataDir()
  if (!existsSync(STATE_PATH)) return { ...DEFAULT_STATE, settings: { ...DEFAULT_SETTINGS } }
  try {
    const raw = JSON.parse(await readFile(STATE_PATH, 'utf8'))
    return cleanState(raw)
  } catch {
    return { ...DEFAULT_STATE, settings: { ...DEFAULT_SETTINGS } }
  }
}

let writing = null
export async function writeState(state, { immediate = false } = {}) {
  await ensureDataDir()
  const payload = JSON.stringify(cleanState(state), null, 2)
  if (writing && !immediate) {
    await writing.catch(() => {})
  }
  writing = (async () => {
    const temp = `${STATE_PATH}.tmp`
    await writeFile(temp, payload, { mode: 0o600 })
    await rename(temp, STATE_PATH)
  })()
  return writing
}

export async function readTokens() {
  try {
    const raw = JSON.parse(await readFile(TOKENS_PATH, 'utf8'))
    return raw && typeof raw === 'object' ? raw : null
  } catch {
    return null
  }
}

export async function writeTokens(tokens) {
  await ensureDataDir()
  const temp = `${TOKENS_PATH}.tmp`
  await writeFile(temp, JSON.stringify(tokens, null, 2), { mode: 0o600 })
  await chmod(temp, 0o600).catch(() => {})
  await rename(temp, TOKENS_PATH)
}

export async function clearTokens() {
  try {
    const { unlink } = await import('node:fs/promises')
    await unlink(TOKENS_PATH)
  } catch { /* ignore */ }
}
