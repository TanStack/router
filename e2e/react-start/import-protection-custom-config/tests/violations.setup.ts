import fs from 'node:fs'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import { chromium, expect } from '@playwright/test'
import {
  appServerReadyPattern,
  spawnDevServer,
  stopDevServer,
} from '@tanstack/router-e2e-utils'

import { extractViolationsFromLog } from './violations.utils'
import type { FullConfig } from '@playwright/test'
import type { Violation } from './violations.utils'

async function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now()

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

const routes = ['/', '/backend-leak', '/frontend-leak'] as const

const routeReadyTestIds: Record<string, string> = {
  '/': 'heading',
  '/backend-leak': 'backend-leak-heading',
  '/frontend-leak': 'frontend-leak-heading',
}

async function navigateAllRoutes(
  baseURL: string,
  browser: Awaited<ReturnType<typeof chromium.launch>>,
): Promise<void> {
  const context = await browser.newContext()
  const page = await context.newPage()

  for (const route of routes) {
    try {
      try {
        await page.goto(`${baseURL}${route}`, {
          waitUntil: 'networkidle',
          timeout: 15_000,
        })
      } catch {
        await page.goto(`${baseURL}${route}`, {
          waitUntil: 'load',
          timeout: 30_000,
        })
      }

      const testId = routeReadyTestIds[route]
      if (testId) {
        await page.getByTestId(testId).waitFor({ timeout: 10_000 })
      }
    } catch {
      // ignore navigation errors — we only care about server logs
    } finally {
      await new Promise((r) => setTimeout(r, 750))
    }
  }

  await context.close()
}

async function runDevPass(cwd: string): Promise<Array<Violation>> {
  const logChunks: Array<string> = []
  const child = spawnDevServer(cwd, 'vite', { VITE_NODE_ENV: 'test' })

  child.stdout?.on('data', (d: Buffer) => logChunks.push(d.toString()))
  child.stderr?.on('data', (d: Buffer) => logChunks.push(d.toString()))

  try {
    await expect
      .poll(
        () =>
          appServerReadyPattern.exec(
            stripVTControlCharacters(logChunks.join('')),
          )?.groups?.E2E_APP_PORT,
        { timeout: 30_000 },
      )
      .toBeTruthy()
    const port = appServerReadyPattern.exec(
      stripVTControlCharacters(logChunks.join('')),
    )!.groups!.E2E_APP_PORT
    const baseURL = `http://localhost:${port}`
    await waitForHttpOk(baseURL, 30_000)

    const browser = await chromium.launch()
    try {
      await navigateAllRoutes(baseURL, browser)
    } finally {
      await browser.close()
    }

    await new Promise((r) => setTimeout(r, 750))
  } finally {
    await stopDevServer(child)
  }

  const text = logChunks.join('')
  return extractViolationsFromLog(text)
}

async function captureDevViolations(cwd: string): Promise<void> {
  const coldViolations = await runDevPass(cwd)

  fs.writeFileSync(
    path.resolve(cwd, 'violations.dev.json'),
    JSON.stringify(coldViolations, null, 2),
  )
}

export default async function globalSetup(config: FullConfig) {
  void config
  const cwd = path.resolve(import.meta.dirname, '..')

  // webServer.command writes build output to this file.
  const logFile = path.resolve(cwd, 'webserver-build.log')

  if (!fs.existsSync(logFile)) {
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
