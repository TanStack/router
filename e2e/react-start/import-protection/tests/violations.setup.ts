import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import type { FullConfig } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }

import { extractViolationsFromLog } from './violations.utils'

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for ${url}`)
    }

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(1000),
      })
      if (res.ok) return
    } catch {
      // ignore
    }

    await new Promise((r) => setTimeout(r, 200))
  }
}

function startDevServer(cwd: string, port: number): ReturnType<typeof spawn> {
  return spawn('pnpm', ['exec', 'vite', 'dev', '--port', String(port)], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      VITE_SERVER_PORT: String(port),
      VITE_NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function killChild(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.killed) return
  await new Promise<void>((resolve) => {
    let resolved = false
    const done = () => {
      if (resolved) return
      resolved = true
      resolve()
    }
    child.once('exit', done)
    child.once('error', done)
    try {
      child.kill('SIGTERM')
    } catch {
      done()
      return
    }
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      // Resolve after a grace period even if 'exit' never fires.
      setTimeout(done, 500)
    }, 3000)
  })
}

const routes = [
  '/',
  '/leaky-server-import',
  '/client-only-violations',
  '/client-only-jsx',
]

const extraModulePaths = [
  '/src/routes/leaky-server-import.tsx',
  '/src/violations/leaky-server-import.ts',
  '/src/routes/client-only-violations.tsx',
  '/src/routes/client-only-jsx.tsx',
  '/src/violations/window-size.client.tsx',
  // Index route violation modules: triggers client-env violations for
  // file-based (edge-a, edge-3, compiler-leak → secret.server) and
  // marker-based (marked-server-only) denials.
  '/src/routes/index.tsx',
  '/src/violations/edge-a.ts',
  '/src/violations/edge-1.ts',
  '/src/violations/edge-2.ts',
  '/src/violations/edge-3.ts',
  '/src/violations/compiler-leak.ts',
  '/src/violations/marked-server-only-edge.ts',
  '/src/violations/marked-server-only.ts',
]

/**
 * Warmup pass: start a throwaway Vite dev server, hit all routes and module
 * URLs so that Vite's dep optimization runs and populates the
 * `node_modules/.vite` cache, then kill the server.
 *
 * On a cold start (no `.vite` cache), Vite's dep optimization runs lazily on
 * first request.  During that burst, `resolveId` can fire before the
 * transform-cache plugin has stored `{code, map}` for importers, which means
 * violations logged in this window may lack snippets.
 *
 * By running the warmup in a separate server instance we ensure the `.vite`
 * dep cache exists before the real capture pass starts.  The second server
 * boots with a warm dep cache so all transforms are populated before
 * `resolveId` fires for violation edges.
 */
async function warmupDepOptimization(
  cwd: string,
  port: number,
  baseURL: string,
): Promise<void> {
  const child = startDevServer(cwd, port)

  // Drain output to /dev/null — we don't need warmup logs.
  child.stdout?.resume()
  child.stderr?.resume()

  try {
    await waitForHttpOk(baseURL, 30_000)

    // Fetch HTML pages to trigger SSR transforms + dep discovery.
    for (const route of routes) {
      try {
        await fetch(`${baseURL}${route}`, {
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        // ignore
      }
    }

    // Fetch module URLs to trigger client-env transforms and ensure all
    // external deps are discovered and optimized.
    const moduleUrls = ['/@vite/client', ...extraModulePaths].map((u) =>
      u.startsWith('http') ? u : `${baseURL}${u}`,
    )
    for (const url of moduleUrls) {
      try {
        await fetch(url, { signal: AbortSignal.timeout(10_000) })
      } catch {
        // ignore
      }
    }

    // Wait for dep optimization to finish writing the .vite cache.
    await new Promise((r) => setTimeout(r, 2000))
  } finally {
    await killChild(child)
  }
}

async function captureDevViolations(cwd: string): Promise<void> {
  const port = await getTestServerPort(`${packageJson.name}_dev`)
  const baseURL = `http://localhost:${port}`
  const logFile = path.resolve(cwd, 'webserver-dev.log')

  // --- Warmup pass ----------------------------------------------------------
  // Run a throwaway dev server to populate the .vite dep cache.  This is a
  // no-op when the cache already exists (warm start).
  await warmupDepOptimization(cwd, port, baseURL)

  // --- Capture pass (warm dep cache) ----------------------------------------
  const out = fs.createWriteStream(logFile)
  const child = startDevServer(cwd, port)

  child.stdout?.on('data', (d: Buffer) => out.write(d))
  child.stderr?.on('data', (d: Buffer) => out.write(d))

  try {
    await waitForHttpOk(baseURL, 30_000)

    const htmlPages: Array<string> = []
    for (const route of routes) {
      try {
        const htmlRes = await fetch(`${baseURL}${route}`, {
          signal: AbortSignal.timeout(5000),
        })
        htmlPages.push(await htmlRes.text())
      } catch {
        // ignore
      }
    }

    const scriptSrcs = htmlPages
      .flatMap((html) =>
        Array.from(
          html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g),
        ).map((m) => m[1]),
      )
      .filter(Boolean)
      .slice(0, 10)

    // Trigger module transforms by fetching module scripts referenced from
    // HTML, plus known module paths to ensure code-split routes are
    // transformed.  Fetching these via HTTP triggers Vite's client-environment
    // transform pipeline, which fires resolveId for each import and surfaces
    // violations.
    const moduleUrls = Array.from(
      new Set(['/@vite/client', ...scriptSrcs, ...extraModulePaths]),
    )
      .map((u) => (u.startsWith('http') ? u : `${baseURL}${u}`))
      .slice(0, 30)

    for (const url of moduleUrls) {
      try {
        await fetch(url, {
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        // ignore
      }
    }

    // Give the server a moment to flush logs.
    await new Promise((r) => setTimeout(r, 750))
  } finally {
    await killChild(child)
    out.end()
  }

  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(path.resolve(cwd, 'violations.dev.json'), '[]')
    return
  }

  const text = fs.readFileSync(logFile, 'utf-8')
  const violations = extractViolationsFromLog(text)
  fs.writeFileSync(
    path.resolve(cwd, 'violations.dev.json'),
    JSON.stringify(violations, null, 2),
  )
}

export default async function globalSetup(config: FullConfig) {
  void config
  // This file lives in ./tests; fixture root is one directory up.
  const cwd = path.resolve(import.meta.dirname, '..')

  // webServer.command writes build output to this file.
  const logFile = path.resolve(cwd, 'webserver-build.log')

  if (!fs.existsSync(logFile)) {
    // If the log doesn't exist, leave an empty violations file.
    fs.writeFileSync(path.resolve(cwd, 'violations.build.json'), '[]')
    return
  }

  const text = fs.readFileSync(logFile, 'utf-8')
  const violations = extractViolationsFromLog(text)
  fs.writeFileSync(
    path.resolve(cwd, 'violations.build.json'),
    JSON.stringify(violations, null, 2),
  )

  await captureDevViolations(cwd)
}
