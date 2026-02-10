import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import express from 'express'
import { toNodeHandler } from 'srvx/node'

const require = createRequire(import.meta.url)
const port = process.env.PORT || 3000

if (!globalThis.self) {
  globalThis.self = globalThis
}

const bundledServerPath = path.resolve('./dist/server/server.js')
const commonJsServerPath = path.resolve('./dist/server/server.cjs')
fs.copyFileSync(bundledServerPath, commonJsServerPath)

let imported = require(commonJsServerPath)
if (imported && typeof imported.then === 'function') {
  imported = await imported
}
const server = imported?.default ?? imported
const nodeHandler = toNodeHandler(server.fetch)

const app = express()

app.use(express.static('./dist/client', { index: false }))
app.use(async (req, res, next) => {
  try {
    await nodeHandler(req, res)
  } catch (error) {
    next(error)
  }
})

app.listen(port, () => {
  console.info(`Start Server: http://localhost:${port}`)
})
