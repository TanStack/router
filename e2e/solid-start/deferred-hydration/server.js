import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { toNodeHandler } from 'srvx/node'

const port = process.env.PORT || 3000
const distDir = process.env.E2E_DIST_DIR || 'dist-vite-ssr'
const distClientDir = path.resolve(distDir, 'client')
const staticContentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
}

function resolveDistServerEntryPath() {
  const candidates = [
    path.resolve(distDir, 'server', 'server.js'),
    path.resolve(distDir, 'server', 'index.js'),
    path.resolve(distDir, 'server', 'index.mjs'),
  ]

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

function getStaticFilePath(requestUrl) {
  const url = new URL(requestUrl, `http://localhost:${port}`)
  let decodedPath
  try {
    decodedPath = decodeURIComponent(url.pathname)
  } catch {
    return null
  }

  const filePath = path.resolve(distClientDir, `.${decodedPath}`)

  if (!filePath.startsWith(`${distClientDir}${path.sep}`)) {
    return null
  }

  return filePath
}

async function tryServeStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false
  }

  const filePath = getStaticFilePath(req.url ?? '/')
  if (!filePath) {
    return false
  }

  const fileStat = await stat(filePath).catch(() => null)
  if (!fileStat?.isFile()) {
    return false
  }

  res.statusCode = 200
  res.setHeader(
    'content-type',
    staticContentTypes[path.extname(filePath)] ?? 'application/octet-stream',
  )
  res.setHeader('content-length', String(fileStat.size))

  if (req.method === 'HEAD') {
    res.end()
    return true
  }

  createReadStream(filePath).pipe(res)
  return true
}

async function createStartServer() {
  const server = (await import(resolveDistServerEntryPath())).default
  const nodeHandler = toNodeHandler(server.fetch)

  return createServer(async (req, res) => {
    if (await tryServeStatic(req, res)) {
      return
    }

    await nodeHandler(req, res)
  })
}

createStartServer().then((server) => {
  server.listen(port, () => {
    console.info(`Start Server: http://localhost:${port}`)
  })
})
