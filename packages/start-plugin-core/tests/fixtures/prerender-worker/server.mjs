import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'

// SDKs may start background work when the SSR bundle imports them.
setInterval(() => {}, 30_000)

const outputDir = process.env.TSS_CLIENT_OUTPUT_DIR
if (!outputDir) {
  throw new Error('Missing prerender output directory')
}
process.on('exit', () => {
  writeFileSync(join(outputDir, 'exit-hook.txt'), 'Preview exit hook completed')
})

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function respond(req, res) {
  res.setHeader('content-type', 'text/html')
  res.write('<html><body>begin')
  await setTimeout(50)
  res.end(`:complete:${req.url}:${process.env.TSS_PRERENDERING}</body></html>`)
}
