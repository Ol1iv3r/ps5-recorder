import { buildTitle, finalizeRecording, buildDescription } from '../lib/pipeline.mjs'
const title = buildTitle({ game: 'GTA VI', episode: 1 })
console.log('title:', title)
const source = process.argv[2]
const result = await finalizeRecording({
  sourcePath: source,
  title,
  outputDir: '/tmp/ps5-final',
  makeThumbnail: true,
  keepOriginal: true,
  onLog: console.log,
})
console.log(result)
console.log('description:\n' + buildDescription('', { game: 'GTA VI', episode: 1, title, durationSec: result.durationSec }))
