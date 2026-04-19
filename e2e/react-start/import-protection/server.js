import fs from 'node:fs'
import path from 'node:path'

const distDir = process.env.E2E_DIST_DIR || 'dist'

function resolveDistClientDir() {
  return path.resolve(distDir, 'client')
}

function resolveDistServerEntryPath() {
  const serverJsPath = path.resolve(distDir, 'server', 'server.js')
  if (fs.existsSync(serverJsPath)) {
    return serverJsPath
  }

  const indexJsPath = path.resolve(distDir, 'server', 'index.js')
  if (fs.existsSync(indexJsPath)) {
    return indexJsPath
  }

  return serverJsPath
}

export function resolveStartCommand() {
  const distClientDir = resolveDistClientDir()
  const distServerEntryPath = resolveDistServerEntryPath()
  return `pnpx srvx --prod -s ${JSON.stringify(distClientDir)} ${JSON.stringify(distServerEntryPath)}`
}
