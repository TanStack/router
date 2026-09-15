import { setTimeout } from 'node:timers/promises'

// SDKs may start background work when the SSR bundle imports them.
setInterval(() => {}, 30_000)

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
