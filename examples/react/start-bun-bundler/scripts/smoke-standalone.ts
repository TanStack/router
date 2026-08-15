/**
 * Smoke: bun.standalone compile → run dist/server/start → assert `/` + assets.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const port = 3459
const host = '127.0.0.1'
const exe = join(root, 'dist/server/start')

async function waitForServer(url: string, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 200) {
        return
      }
    } catch {
      // retry
    }
    await Bun.sleep(150)
  }
  throw new Error(`Server did not become ready at ${url}`)
}

console.info('[smoke-standalone] building with bun.standalone…')
const build = spawn('bun', ['run', './scripts/build-standalone.ts'], {
  cwd: root,
  stdio: 'inherit',
})
await new Promise<void>((resolve, reject) => {
  build.on('exit', (code) =>
    code === 0
      ? resolve()
      : reject(new Error(`build-standalone exited ${code}`)),
  )
})

if (!existsSync(exe)) {
  throw new Error(`missing standalone executable at ${exe}`)
}

console.info('[smoke-standalone] starting executable…')
const server = spawn(exe, [], {
  cwd: root,
  env: { ...process.env, PORT: String(port), HOST: host },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stderr = ''
server.stderr?.on('data', (chunk) => {
  stderr += String(chunk)
})

try {
  await waitForServer(`http://${host}:${port}/`)

  const home = await fetch(`http://${host}:${port}/`)
  const homeHtml = await home.text()
  if (!home.ok) {
    throw new Error(`GET / → ${home.status}`)
  }
  if (!homeHtml.includes('Hello from Bun-bundled Start')) {
    throw new Error('GET / missing loader message in HTML')
  }

  const preloadMatch = homeHtml.match(
    /modulepreload[^>]+href="(\/assets\/[^"]+\.js)"/,
  )
  if (!preloadMatch?.[1]) {
    throw new Error('GET / missing modulepreload asset href')
  }
  const asset = await fetch(`http://${host}:${port}${preloadMatch[1]}`)
  if (!asset.ok) {
    throw new Error(`GET ${preloadMatch[1]} → ${asset.status}`)
  }

  console.info('[smoke-standalone] ok')
} catch (err) {
  if (stderr) {
    console.error('[smoke-standalone] server stderr:\n', stderr)
  }
  throw err
} finally {
  server.kill('SIGTERM')
}
