// Child of server.mjs: imports a Start server entry, sends one request to `/`
// and prints one JSON line. `performance.now()` counts from process start.
// With --trace, records every module URL Node loads (ESM and CommonJS).

import { createHash } from 'node:crypto'
import { registerHooks } from 'node:module'

const [entryUrl, flag] = process.argv.slice(2)
const loaded = []

if (flag === '--trace') {
  registerHooks({
    load(url, context, nextLoad) {
      loaded.push(url)
      return nextLoad(url, context)
    },
  })
}

const module = await import(entryUrl)
const importMs = performance.now()
const handler = module.default
const fetch =
  typeof handler === 'function' ? handler : handler.fetch.bind(handler)
const response = await fetch(new Request('http://localhost/'))
const body = await response.text()
const responseMs = performance.now()
const cpu = process.cpuUsage()

process.stdout.write(
  JSON.stringify({
    importMs,
    responseMs,
    status: response.status,
    bodyBytes: Buffer.byteLength(body),
    bodyHash: createHash('sha256').update(body).digest('hex').slice(0, 16),
    cpuUserUs: cpu.user,
    cpuSystemUs: cpu.system,
    loaded: flag === '--trace' ? [...new Set(loaded)] : undefined,
  }) + '\n',
)
process.exit(0)
