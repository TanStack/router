import { chromium } from '@playwright/test'
import {
  e2eStartDummyServer,
  getTestServerPort,
} from '@tanstack/router-e2e-utils'
import packageJson from '../../package.json' with { type: 'json' }
import { ssrStylesMode, useNitro } from '../../env'

function getPortKey() {
  let key = packageJson.name
  if (ssrStylesMode !== 'default') {
    key += `-${ssrStylesMode}`
  }
  if (useNitro) {
    key += '-nitro'
  }
  return key
}

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
    await page.getByTestId('home-heading').waitFor({ state: 'visible' })
    await page.waitForLoadState('networkidle')

    // Ensure we end in a stable state
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
  const portKey = getPortKey()

  await e2eStartDummyServer(portKey)

  if (process.env.MODE !== 'dev') return

  const port = await getTestServerPort(portKey)
  const baseURL = `http://localhost:${port}`

  await waitForServer(baseURL)
  await preOptimizeDevServer(baseURL)
}
