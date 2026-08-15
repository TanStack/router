/**
 * Smoke check: Nitro bridge build → .output/server → assert `/`, assets, public dir.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const port = 3458
const host = '127.0.0.1'

async function waitForServer(url: string, attempts = 60) {
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

console.info('[smoke-nitro] building with bun.nitro…')
const build = spawn('bun', ['run', './scripts/build-nitro.ts'], {
  cwd: root,
  stdio: 'inherit',
})
await new Promise<void>((resolve, reject) => {
  build.on('error', reject)
  build.on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`build-nitro exited ${code}`)),
  )
})

const publicDir = join(root, '.output/public')
const serverEntry = join(root, '.output/server/index.mjs')
if (!existsSync(publicDir)) {
  throw new Error(`missing ${publicDir}`)
}
if (!existsSync(serverEntry)) {
  throw new Error(`missing ${serverEntry}`)
}

const assetFiles = [...new Bun.Glob('assets/**/*').scanSync({ cwd: publicDir })]
if (assetFiles.length === 0) {
  throw new Error(`.output/public has no assets/ files`)
}

console.info('[smoke-nitro] starting .output/server/index.mjs…')
const server = spawn('node', [serverEntry], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NITRO_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
server.stdout?.on('data', (chunk) => {
  stdout += String(chunk)
})
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

  console.info('[smoke-nitro] ok')
} catch (err) {
  if (stdout) {
    console.error('[smoke-nitro] server stdout:\n', stdout)
  }
  if (stderr) {
    console.error('[smoke-nitro] server stderr:\n', stderr)
  }
  throw err
} finally {
  server.kill('SIGTERM')
}
