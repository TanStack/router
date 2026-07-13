import { spawn } from 'node:child_process'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import type { Page } from '@playwright/test'

// Regression test for https://github.com/TanStack/router/issues/7283
//
// Selective SSR routes (`ssr: false` / `ssr: 'data-only'`) that declare a
// `pendingComponent` must hydrate cleanly in DEV mode. Solid only validates
// hydration markers in dev, so the production webServer configured in
// playwright.config.ts masks the mismatch ("template is not a function",
// route never reaches its loaded component). This spec therefore boots its
// own `vite dev` server on a dedicated port and drives the app against it.

const DEV_PORT = 58283
const devBaseURL = `http://localhost:${DEV_PORT}`

let devServer: ChildProcess | undefined

async function waitForServer(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch (err) {
      lastError = err
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`dev server did not start on ${url}: ${lastError}`)
}

test.beforeAll(async () => {
  const appDir = path.resolve(import.meta.dirname, '..')
  devServer = spawn(
    'pnpm',
    [
      'dev:e2e',
      '--host',
      'localhost',
      '--port',
      String(DEV_PORT),
      '--strictPort',
    ],
    {
      cwd: appDir,
      env: {
        ...process.env,
        VITE_SERVER_PORT: String(DEV_PORT),
        NODE_ENV: 'development',
      },
      stdio: 'ignore',
      detached: true,
    },
  )
  await waitForServer(`${devBaseURL}/`, 90_000)
})

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }
})

function collectHydrationFailures(page: Page) {
  const failures: Array<string> = []
  const isHydrationFailure = (text: string) =>
    text.includes('template is not a function') ||
    text.includes("wasn't caught by any route") ||
    text.includes('Hydration Mismatch')
  page.on('pageerror', (err) => {
    if (isHydrationFailure(err.message)) failures.push(err.message)
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const text = msg.text()
      if (isHydrationFailure(text)) failures.push(text)
    }
  })
  return failures
}

test.describe('dev-mode hydration of selective SSR routes with pendingComponent', () => {
  test.setTimeout(120_000)

  test('ssr:false route with pendingComponent hydrates cleanly and reaches its loaded component (issue #7283)', async ({
    page,
  }) => {
    const failures = collectHydrationFailures(page)

    await page.goto(`${devBaseURL}/ssr-false-pending-min`)

    // The loaded component must eventually replace the pending UI.
    await expect(page.getByTestId('ssr-false-target')).toBeVisible({
      timeout: 15_000,
    })

    // No dev hydration mismatch may occur along the way.
    expect(failures).toEqual([])
  })

  test('data-only route with pendingComponent hydrates cleanly and reaches its loaded component (regression vs main)', async ({
    page,
  }) => {
    const failures = collectHydrationFailures(page)

    await page.goto(`${devBaseURL}/data-only-pending-component`)

    await expect(
      page.getByTestId('data-only-pending-component-ready-label'),
    ).toHaveText('OK - loader finished', { timeout: 15_000 })

    expect(failures).toEqual([])
  })
})
