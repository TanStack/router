import { chromium } from '@playwright/test'
import {
  e2eStartDummyServer,
  getTestServerPort,
} from '@tanstack/router-e2e-utils'
import packageJson from '../../package.json' with { type: 'json' }

async function waitForServer(url: string) {
  const start = Date.now()
  while (Date.now() - start < 30_000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5_000)
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
      })
      if (res.status >= 200 && res.status < 400) return
    } catch {
      // ignore aborted/network errors
    } finally {
      clearTimeout(timer)
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Timed out waiting for dev server at ${url}`)
}

async function preOptimizeDevServer(baseURL: string) {
  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('global-styled').waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')

    await page.goto(`${baseURL}/modules`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('module-card').waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')

    await page.goto(`${baseURL}/sass-mixin`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('mixin-styled').waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')

    await page.goto(`${baseURL}/quotes`, { waitUntil: 'domcontentloaded' })
    await page.getByTestId('quote-styled').waitFor({ state: 'visible' })
    await page.getByTestId('after-quote-styled').waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')

    // Ensure we end in a stable state. Vite's optimize step triggers a reload;
    // this waits until no further navigations happen for a short window.
    for (let i = 0; i < 40; i++) {
      const currentUrl = page.url()
      await page.waitForTimeout(250)
      if (page.url() === currentUrl) {
        await page.waitForTimeout(250)
        if (page.url() === currentUrl) return
      }
    }

    throw new Error('Dev server did not reach a stable URL after warmup')
  } finally {
    await context.close()
    await browser.close()
  }
}

export default async function setup() {
  await e2eStartDummyServer(packageJson.name)

  if (process.env.MODE !== 'dev') return

  const viteConfig = process.env.VITE_CONFIG // 'nitro' | 'basepath' | 'cloudflare' | undefined
  const port = await getTestServerPort(
    viteConfig ? `${packageJson.name}-${viteConfig}` : packageJson.name,
  )
  const basePath = viteConfig === 'basepath' ? '/my-app' : ''
  const baseURL = `http://localhost:${port}${basePath}`

  await waitForServer(baseURL)
  await preOptimizeDevServer(baseURL)
}
