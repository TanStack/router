// Child process that runs a Vite dev server for the harness.
//
// Usage: node dev-driver.mjs <appDir> <port>
// Talks to the parent over IPC:
//   -> { type: 'listening', ... }           once the server listens
//   <- { type: 'compile-all' }              transform every app module
//   -> { type: 'compile-all', result }
//   <- { type: 'stop' }                     close the server and exit

import fs from 'node:fs'
import module from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

const [appDir, portArg] = process.argv.slice(2)
const send = (msg) => process.send?.(msg)
// performance.now() in a fresh process is measured from process start.
const marks = { processStart: 0 }

// Like Vite's CLI: cache compiled JS of Vite and the plugins across runs.
module.enableCompileCache?.()
setTimeout(() => module.flushCompileCache?.(), 10_000).unref()

// The app links the vite instance the TanStack plugins use (see
// resolveSharedPackages in generate.mjs).
const vite = await import(
  pathToFileURL(path.join(appDir, 'node_modules/vite/dist/node/index.js')).href
)
marks.viteImported = performance.now()

const server = await vite.createServer({
  root: appDir,
  configFile: path.join(appDir, 'vite.config.ts'),
  server: { port: Number(portArg), strictPort: true, host: '127.0.0.1' },
})
marks.serverCreated = performance.now()
await server.listen()
marks.listening = performance.now()
send({
  type: 'listening',
  marks,
  epochMs: performance.timeOrigin + marks.listening,
})

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

function seedUrls() {
  const src = path.join(appDir, 'src')
  const seeds = [
    ...['router.tsx', 'main.tsx', 'routeTree.gen.ts']
      .map((f) => path.join(src, f))
      .filter((f) => fs.existsSync(f)),
    ...walk(path.join(src, 'routes')),
  ]
  return seeds.map(
    (file) => '/' + path.relative(appDir, file).split(path.sep).join('/'),
  )
}

function shouldCrawl(mod) {
  const id = mod.id ?? mod.url
  if (!id) {
    return false
  }
  if (
    id.includes('/node_modules/') ||
    id.includes('/.vite-cache/') ||
    id.startsWith('/@vite/')
  ) {
    return false
  }
  if (
    id.startsWith('\0') ||
    id.startsWith('virtual:') ||
    id.startsWith('/@id/')
  ) {
    return true
  }
  return id.startsWith(appDir)
}

async function compileEnvironment(env) {
  const seen = new Set()
  const errors = []
  let wave = seedUrls()
  const t0 = performance.now()
  while (wave.length) {
    const next = []
    await Promise.all(
      wave.map(async (url) => {
        if (seen.has(url)) {
          return
        }
        seen.add(url)
        try {
          await env.transformRequest(url)
        } catch (error) {
          errors.push({
            url,
            message: String(error?.message ?? error).slice(0, 300),
          })
          return
        }
        const mod = await env.moduleGraph.getModuleByUrl(url)
        for (const dep of mod?.importedModules ?? []) {
          if (shouldCrawl(dep) && !seen.has(dep.url)) {
            next.push(dep.url)
          }
        }
      }),
    )
    wave = [...new Set(next)].filter((url) => !seen.has(url))
  }
  return { ms: performance.now() - t0, modules: seen.size, errors }
}

process.on('message', async (msg) => {
  if (msg?.type === 'compile-all') {
    const result = { envs: {} }
    const t0 = performance.now()
    const names = Object.keys(server.environments).sort((a, b) =>
      a === 'client' ? -1 : b === 'client' ? 1 : a.localeCompare(b),
    )
    for (const name of names) {
      result.envs[name] = await compileEnvironment(server.environments[name])
    }
    result.totalMs = performance.now() - t0
    send({ type: 'compile-all', result })
  } else if (msg?.type === 'stop') {
    await server.close()
    process.exit(0)
  }
})
