import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'
import { getTestServerPort } from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }

import { extractViolationsFromLog } from './violations.utils'
import type { FullConfig } from '@playwright/test'
import type { Violation } from './violations.utils'

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now()

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
  '/beforeload-leak',
]

async function navigateAllRoutes(
  baseURL: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<void> {
  const context = await browser.newContext()
  const page = await context.newPage()

  for (const route of routes) {
    try {
      await page.goto(`${baseURL}${route}`, {
        waitUntil: 'networkidle',
        timeout: 15_000,
      })
    } catch {
      // ignore navigation errors — we only care about server logs
    }
  }

  await context.close()
}

/**
 * Starts a dev server, navigates all routes, captures violations.
 * Returns the extracted violations array.
 */
async function runDevPass(
  cwd: string,
  port: number,
): Promise<Array<Violation>> {
  const baseURL = `http://localhost:${port}`
  const logChunks: Array<string> = []
  const child = startDevServer(cwd, port)

  child.stdout?.on('data', (d: Buffer) => logChunks.push(d.toString()))
  child.stderr?.on('data', (d: Buffer) => logChunks.push(d.toString()))

  try {
    await waitForHttpOk(baseURL, 30_000)

    const browser = await chromium.launch()
    try {
      await navigateAllRoutes(baseURL, browser)
    } finally {
      await browser.close()
    }

    await new Promise((r) => setTimeout(r, 750))
  } finally {
    await killChild(child)
  }

  const text = logChunks.join('')
  return extractViolationsFromLog(text)
}

/**
 * Captures dev violations in two passes:
 *   1. Cold — fresh dev server, Vite compiles all modules from scratch.
 *   2. Warm — restart dev server (Vite's .vite cache persists on disk),
 *      modules are pre-transformed so resolveId/transform paths differ.
 */
async function captureDevViolations(cwd: string): Promise<void> {
  const port = await getTestServerPort(`${packageJson.name}_dev`)

  const coldViolations = await runDevPass(cwd, port)

  fs.writeFileSync(
    path.resolve(cwd, 'violations.dev.json'),
    JSON.stringify(coldViolations, null, 2),
  )
  fs.writeFileSync(
    path.resolve(cwd, 'violations.dev.cold.json'),
    JSON.stringify(coldViolations, null, 2),
  )

  // Warm pass: the .vite cache from the cold run is still on disk.
  const warmViolations = await runDevPass(cwd, port)

  fs.writeFileSync(
    path.resolve(cwd, 'violations.dev.warm.json'),
    JSON.stringify(warmViolations, null, 2),
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
