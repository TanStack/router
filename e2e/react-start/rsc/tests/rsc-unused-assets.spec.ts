import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'
import { waitForHydration } from './hydration'
import type { Page } from '@playwright/test'

// Find the actual emitted chunks in either bundler's output. The route imports
// only the server function stub; these markers identify ClientWidgetC itself.
function unusedAssets() {
  const clientDir = resolve(process.env.E2E_DIST_DIR ?? 'dist', 'client')
  const files = readdirSync(clientDir, { recursive: true, encoding: 'utf8' })
  const assets = files.filter((file) => {
    if (!/\.(js|css)$/.test(file)) {
      return false
    }
    const source = readFileSync(resolve(clientDir, file), 'utf8')
    return file.endsWith('.js')
      ? source.includes('client-widget-c-slider')
      : source.includes('.client-widget-c')
  })
  expect(assets.some((file) => file.endsWith('.js'))).toBe(true)
  expect(assets.some((file) => file.endsWith('.css'))).toBe(true)
  return assets.map((file) => `/${file.replaceAll('\\', '/')}`)
}

function observe(page: Page, assets: Array<string>) {
  const requested = new Set<string>()
  const errors: Array<string> = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (assets.includes(path)) {
      requested.add(path)
    }
  })
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text())
    }
  })
  return { requested, errors }
}

async function interactWithRenderedWidgets(page: Page) {
  await waitForHydration(page)
  await expect(page.getByTestId('client-widget-a')).toHaveCSS(
    'background-color',
    'rgb(243, 232, 255)',
  )
  await expect(page.getByTestId('client-widget-b')).toHaveCSS(
    'background-color',
    'rgb(204, 251, 241)',
  )
  for (let count = 1; count <= 20; count++) {
    await page.getByTestId('client-widget-a-increment').click()
    await expect(page.getByTestId('client-widget-a-count')).toHaveText(
      String(count),
    )
  }
  await page.getByTestId('client-widget-b-toggle').click()
  await expect(page.getByTestId('client-widget-b-toggle')).toHaveText('Active')
  await expect(page.getByTestId('client-widget-c')).toHaveCount(0)
  await expect(page.getByTestId('serverb-note')).toHaveCSS(
    'background-color',
    'rgb(219, 234, 254)',
  )
}

async function renderPreviouslyUnusedWidget(page: Page) {
  await page.getByTestId('render-server-b').click()
  await expect(page.getByTestId('client-widget-c')).toBeVisible()
  await expect(page.getByTestId('serverb-note')).toHaveCSS(
    'background-color',
    'rgb(255, 237, 213)',
  )
  await page.getByTestId('client-widget-c-slider').focus()
  await page.getByTestId('client-widget-c-slider').press('ArrowRight')
  await expect(page.getByTestId('client-widget-c-value')).toHaveText('51%')
}

test('client navigation loads unused RSC assets only when that RSC is rendered', async ({
  page,
}) => {
  const assets = unusedAssets()
  const { requested, errors } = observe(page, assets)
  await page.goto('/')
  await waitForHydration(page)
  const documents: Array<string> = []
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documents.push(request.url())
    }
  })
  await page.getByTestId('nav-css-preload-complex').click()
  await interactWithRenderedWidgets(page)
  expect(documents).toEqual([])
  expect([...requested]).toEqual([])

  await renderPreviouslyUnusedWidget(page)
  expect([...requested].sort()).toEqual(assets.sort())
  expect(errors).toEqual([])
})

test('fresh browsers do not load unused RSC assets from a warm SSR server', async ({
  browser,
  baseURL,
}) => {
  const assets = unusedAssets()
  for (let visit = 0; visit < 4; visit++) {
    const context = await browser.newContext({ baseURL })
    try {
      const page = await context.newPage()
      const { requested, errors } = observe(page, assets)
      await page.goto('/rsc-css-preload-complex')
      await interactWithRenderedWidgets(page)
      expect([...requested], `SSR visit ${visit + 1}`).toEqual([])
      await renderPreviouslyUnusedWidget(page)
      expect([...requested].sort()).toEqual(assets.sort())
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  }
})

test('rendered RSC content waits for its stylesheet', async ({ page }) => {
  await page.goto('/')
  await waitForHydration(page)
  let releaseStyles!: () => void
  const stylesReleased = new Promise<void>((resolve) => {
    releaseStyles = resolve
  })
  await page.route('**/*.css', async (route) => {
    await stylesReleased
    await route.continue()
  })
  const requested = page.waitForRequest('**/*.css')
  const content = page.getByTestId('rsc-css-modules-content')
  try {
    await page.getByTestId('nav-css-modules').click()
    await requested
    // Give the browser a paint opportunity while the stylesheet is held.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }),
    )
    await expect(content).toBeHidden()
  } finally {
    releaseStyles()
  }
  await expect(content).toBeVisible()
  expect(
    await content.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe('rgb(224, 242, 254)')
})
