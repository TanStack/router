/**
 * Smoke check: build → host.js → assert `/`, `/about`, and static assets.
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const port = 3458
const host = '127.0.0.1'

async function waitForServer(url: string, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 200) {
        return
      }
    } catch {
      // retry
    }
    await Bun.sleep(100)
  }
  throw new Error(`Server did not become ready at ${url}`)
}

console.info('[smoke] building…')
const build = spawn('bun', ['run', './scripts/build.ts'], {
  cwd: root,
  stdio: 'inherit',
})
await new Promise<void>((resolve, reject) => {
  build.on('error', reject)
  build.on('exit', (code) =>
    code === 0 ? resolve() : reject(new Error(`build exited ${code}`)),
  )
})

console.info('[smoke] starting host.js…')
const server = spawn('bun', ['run', './dist/server/host.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const serverLogs: Array<string> = []
const capture = (chunk: Buffer | string) => {
  serverLogs.push(String(chunk))
}
server.stdout?.on('data', capture)
server.stderr?.on('data', capture)

try {
  await waitForServer(`http://${host}:${port}/`)

  const home = await fetch(`http://${host}:${port}/`)
  const homeHtml = await home.text()
  if (!home.ok) {
    throw new Error(`GET / → ${home.status}`)
  }
  if (!homeHtml.includes('Hello from Bun-bundled Solid Start')) {
    throw new Error('GET / missing loader message in HTML')
  }

  const about = await fetch(`http://${host}:${port}/about`)
  const aboutHtml = await about.text()
  if (!about.ok) {
    throw new Error(`GET /about → ${about.status}`)
  }
  if (!aboutHtml.includes('Second route')) {
    throw new Error('GET /about missing expected body')
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

  const cssMatch = homeHtml.match(/href="(\/assets\/[^"]+\.css)"/)
  if (cssMatch?.[1]) {
    const css = await fetch(`http://${host}:${port}${cssMatch[1]}`)
    if (!css.ok) {
      throw new Error(`GET ${cssMatch[1]} → ${css.status}`)
    }
  }

  const robots = await fetch(`http://${host}:${port}/robots.txt`)
  if (!robots.ok) {
    throw new Error(`GET /robots.txt → ${robots.status}`)
  }

  console.info('[smoke] ok')
} catch (err) {
  if (serverLogs.length > 0) {
    console.error('[smoke] server output:\n', serverLogs.join(''))
  }
  throw err
} finally {
  server.kill('SIGTERM')
}
