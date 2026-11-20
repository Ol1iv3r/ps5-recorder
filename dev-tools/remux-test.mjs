import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)
const src = process.argv[2]
const out = '/tmp/remux-test.mp4'
await run('/opt/homebrew/bin/ffmpeg', ['-y', '-i', src, '-c', 'copy', '-movflags', '+faststart', '-tag:v', 'hvc1', out])
const probe = await run('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration,format_name:stream=codec_name,codec_type', '-of', 'json', out])
console.log(probe.stdout)
const thumb = '/tmp/thumb-test.jpg'
await run('/opt/homebrew/bin/ffmpeg', ['-y', '-ss', '0.5', '-i', out, '-frames:v', '1', '-vf', 'scale=1280:-2', thumb])
console.log('thumb ok')
