import {
  e2eStartDummyServer,
  getTestServerPort,
  waitForServer,
} from '@tanstack/router-e2e-utils'
import { chromium } from '@playwright/test'
import packageJson from '../../package.json' with { type: 'json' }

async function navigateWithRetry(
  page: import('@playwright/test').Page,
  url: string,
  opts: { maxRetries?: number; waitForTestId?: string } = {},
) {
  const maxRetries = opts.maxRetries ?? 5
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 })
      if (opts.waitForTestId) {
        await page
          .getByTestId(opts.waitForTestId)
          .waitFor({ state: 'visible', timeout: 15000 })
      }
      return
    } catch {
      if (attempt === maxRetries - 1) throw new Error(`Failed to load ${url}`)
      await page.waitForTimeout(2000)
    }
  }
}

export default async function setup() {
  await e2eStartDummyServer(packageJson.name)

  if (process.env.MODE !== 'dev') return

  const port = await getTestServerPort(packageJson.name)
  const baseURL = `http://localhost:${port}`

  await waitForServer(baseURL)

  // RSC dev server keeps HMR websockets open which prevent Playwright's
  // `networkidle` state from ever being reached. Use a custom warmup that
  // avoids `networkidle` instead of `preOptimizeDevServer`.
  // Also, lazy RSC compilation can cause ERR_ABORTED on first navigation,
  // so we retry navigations.
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Visit home page
    await navigateWithRetry(page, `${baseURL}/`, {
      waitForTestId: 'home-heading',
    })

    // Visit RSC basic page (triggers lazy compilation of RSC layer)
    await navigateWithRetry(page, `${baseURL}/rsc-basic`, {
      waitForTestId: 'rsc-basic-content',
    })

    // Visit CSS modules page (triggers lazy compilation)
    await navigateWithRetry(page, `${baseURL}/rsc-css-modules`, {
      waitForTestId: 'rsc-css-modules-content',
    })

    // Visit alt CSS modules page
    await navigateWithRetry(page, `${baseURL}/rsc-css-alt`, {
      waitForTestId: 'rsc-css-alt-content',
    })

    // Visit slots page
    await navigateWithRetry(page, `${baseURL}/rsc-slots`, {
      waitForTestId: 'rsc-slotted-content',
    })

    // Client-side navigation back to home
    await navigateWithRetry(page, `${baseURL}/`, {
      waitForTestId: 'home-heading',
    })

    // Wait for stability
    for (let i = 0; i < 20; i++) {
      const currentUrl = page.url()
      await page.waitForTimeout(250)
      if (page.url() === currentUrl) {
        await page.waitForTimeout(250)
        if (page.url() === currentUrl) break
      }
    }
  } finally {
    await context.close()
    await browser.close()
  }
}
