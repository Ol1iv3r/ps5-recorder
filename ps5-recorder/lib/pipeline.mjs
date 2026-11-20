/**
 * Finalizing a finished OBS recording: probe, remux MKV -> MP4 (stream copy, no
 * quality loss), rename to the user's 「Game | EP 01」 convention, and grab a
 * thumbnail frame for YouTube.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

const run = promisify(execFile)

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg',
].filter(Boolean)

const FFPROBE_CANDIDATES = [
  process.env.FFPROBE_PATH,
  '/opt/homebrew/bin/ffprobe',
  '/usr/local/bin/ffprobe',
  '/usr/bin/ffprobe',
].filter(Boolean)

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch { /* keep looking */ }
  }
  return ''
}

let cachedFfmpeg = ''
let cachedFfprobe = ''
export async function resolveFfmpeg() {
  if (cachedFfmpeg) return cachedFfmpeg
  cachedFfmpeg = await firstExisting(FFMPEG_CANDIDATES)
  return cachedFfmpeg
}
export async function resolveFfprobe() {
  if (cachedFfprobe) return cachedFfprobe
  cachedFfprobe = await firstExisting(FFPROBE_CANDIDATES)
  return cachedFfprobe
}

export async function probeMedia(filePath) {
  const ffprobe = await resolveFfprobe()
  if (!ffprobe) throw new Error('没有找到 ffprobe，请先安装 ffmpeg（brew install ffmpeg）')
  const { stdout } = await run(ffprobe, [
    '-v', 'error', '-print_format', 'json',
    '-show_format', '-show_streams', filePath,
  ], { maxBuffer: 4 * 1024 * 1024 })
  const data = JSON.parse(stdout)
  const video = (data.streams ?? []).find(stream => stream.codec_type === 'video')
  const audio = (data.streams ?? []).find(stream => stream.codec_type === 'audio')
  return {
    durationSec: Number(data.format?.duration) || 0,
    size: Number(data.format?.size) || 0,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: video?.avg_frame_rate ?? '',
    videoCodec: video?.codec_name ?? '',
    audioCodec: audio?.codec_name ?? '',
    hasAudio: Boolean(audio),
  }
}

/** File-name safe version of a title; keeps | and CJK, drops path separators. */
export function sanitizeName(text) {
  return String(text ?? '')
    .replace(/[\\/:*?"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120) || 'PS5 recording'
}

export function formatEpisode(episode, padding = 2) {
  const number = Math.max(1, Math.floor(Number(episode) || 1))
  return String(number).padStart(Math.max(1, padding), '0')
}

/** "GTA VI" + 3 -> "GTA VI | EP 03" */
export function buildTitle({ game, episode, separator = ' | ', padding = 2 }) {
  const cleanGame = String(game ?? '').trim() || 'PS5'
  return `${cleanGame}${separator}EP ${formatEpisode(episode, padding)}`
}

export function buildDescription(template, { game, episode, title, durationSec }) {
  const minutes = Math.round((Number(durationSec) || 0) / 60)
  const fallback = `游戏：${game}\n集数：EP ${formatEpisode(episode)}\n时长：约 ${minutes} 分钟\n\n由 DeepSeek Harness PS5 录制插件自动上传。`
  if (!template || !template.trim()) return fallback
  return template
    .replaceAll('{game}', String(game ?? ''))
    .replaceAll('{episode}', formatEpisode(episode))
    .replaceAll('{title}', title ?? '')
    .replaceAll('{duration}', `${minutes} 分钟`)
}

async function uniquePath(folder, stem, extension) {
  let candidate = join(folder, `${stem}${extension}`)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(folder, `${stem} (${index})${extension}`)
    index += 1
  }
  return candidate
}

/**
 * Turn an OBS output file into the final MP4 for upload.
 * Returns metadata about the produced file; throws only when ffmpeg is missing
 * or the remux genuinely fails.
 */
export async function finalizeRecording(options) {
  const {
    sourcePath,
    title,
    outputDir,
    makeThumbnail = true,
    keepOriginal = false,
    onLog = () => {},
  } = options
  const ffmpeg = await resolveFfmpeg()
  if (!ffmpeg) throw new Error('没有找到 ffmpeg，请先安装：brew install ffmpeg')
  const sourceInfo = await stat(sourcePath)
  if (sourceInfo.size < 1024) throw new Error('录制文件过小，可能没有真正录到画面')

  const probe = await probeMedia(sourcePath)
  await mkdir(outputDir, { recursive: true })
  const stem = sanitizeName(title)

  let finalPath
  if (extname(sourcePath).toLowerCase() === '.mp4') {
    finalPath = await uniquePath(outputDir, stem, '.mp4')
    await rename(sourcePath, finalPath)
  } else {
    const target = join(outputDir, `${stem}.mp4.part.mp4`)
    await unlink(target).catch(() => {})
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', sourcePath, '-map', '0:v:0', '-map', '0:a?']
    args.push('-c', 'copy', '-movflags', '+faststart')
    if (probe.videoCodec === 'hevc') args.push('-tag:v', 'hvc1')
    args.push(target)
    onLog(`remux: ${basename(sourcePath)} -> ${basename(target)}`)
    await run(ffmpeg, args, { maxBuffer: 8 * 1024 * 1024 })
    finalPath = await uniquePath(outputDir, stem, '.mp4')
    await rename(target, finalPath)
    if (!keepOriginal) await unlink(sourcePath).catch(() => {})
  }

  const finalInfo = await stat(finalPath)
  const finalProbe = await probeMedia(finalPath)
  let thumbPath = ''
  if (makeThumbnail && finalProbe.durationSec > 0.5) {
    const at = Math.min(Math.max(1, finalProbe.durationSec * 0.15), 30)
    thumbPath = join(dirname(finalPath), `${basename(finalPath, '.mp4')}.jpg`)
    await run(ffmpeg, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-ss', String(at), '-i', finalPath, '-frames:v', '1',
      '-vf', 'scale=1280:-2', '-q:v', '3', thumbPath,
    ], { maxBuffer: 4 * 1024 * 1024 }).catch(() => { thumbPath = '' })
  }

  const loudness = finalProbe.hasAudio ? await measureAudioLoudness(finalPath) : null
  return {
    filePath: finalPath,
    thumbPath,
    loudness,
    size: finalInfo.size,
    durationSec: finalProbe.durationSec,
    width: finalProbe.width,
    height: finalProbe.height,
    videoCodec: finalProbe.videoCodec,
    audioCodec: finalProbe.audioCodec,
    hasAudio: finalProbe.hasAudio,
    sourceProbe: probe,
  }
}

/** Loudness of the audio track; used to warn about silent recordings. */
export async function measureAudioLoudness(filePath) {
  const ffmpeg = await resolveFfmpeg()
  if (!ffmpeg) return null
  try {
    const { stderr } = await run(ffmpeg, [
      '-hide_banner', '-i', filePath, '-af', 'volumedetect', '-f', 'null', '-',
    ], { maxBuffer: 4 * 1024 * 1024 })
    const max = /max_volume:\s*(-?[\d.]+) dB/.exec(stderr)
    const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)
    return {
      maxDb: max ? Number(max[1]) : null,
      meanDb: mean ? Number(mean[1]) : null,
    }
  } catch {
    return null
  }
}

/** Wait until a file stops growing — used by the folder watcher. */
export async function waitForStableFile(filePath, { quietMs = 4000, timeoutMs = 10 * 60 * 1000 } = {}) {
  const start = Date.now()
  let lastSize = -1
  let lastChange = Date.now()
  for (;;) {
    let size = 0
    try {
      size = (await stat(filePath)).size
    } catch {
      return false
    }
    if (size !== lastSize) {
      lastSize = size
      lastChange = Date.now()
    } else if (Date.now() - lastChange >= quietMs && size > 0) {
      return true
    }
    if (Date.now() - start > timeoutMs) return false
    await new Promise(resolve => setTimeout(resolve, 800))
  }
}
