import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

const fastSearch = '?points=200'
const chartChildMarker = 'deferred-hydration-recharts-child'
const tableChildMarker = 'deferred-hydration-react-table-child'

async function waitForStartup(page: Page) {
  await expect(page.getByTestId('startup-marker')).toHaveAttribute(
    'data-hydrated',
    'true',
  )
}

async function scrollToChart(page: Page) {
  await page.getByTestId('chart-region').evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
}

async function scrollToTable(page: Page) {
  await page.getByTestId('ssr-table-region').evaluate((element) => {
    element.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
}

async function expectChartHydrated(page: Page, hydrated: boolean) {
  await expect(page.getByTestId('chart-region')).toHaveAttribute(
    'data-hydrated',
    hydrated ? 'true' : 'false',
  )
}

async function expectTableHydrated(page: Page, hydrated: boolean) {
  await expect(page.getByTestId('ssr-table-region')).toHaveAttribute(
    'data-hydrated',
    hydrated ? 'true' : 'false',
  )
}

async function clickShellAndExpectCount(page: Page, count: string) {
  await page.getByTestId('shell-action').click()
  await expect(page.getByTestId('shell-click-count')).toHaveText(count)
}

async function clickChartAndExpectCount(page: Page, count: string) {
  await page.getByTestId('chart-action').click()
  await expect(page.getByTestId('chart-click-count')).toHaveText(count)
}

async function clickTableAndExpectCount(page: Page, count: string) {
  await page.getByTestId('table-density-action').click()
  await expect(page.getByTestId('table-density-count')).toHaveText(count)
}

async function resourceContentsContain(
  page: Page,
  request: APIRequestContext,
  marker: string,
) {
  const urls = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => url.endsWith('.js')),
  )

  for (const url of urls) {
    const response = await request.get(url)
    if (!response.ok()) continue
    const text = await response.text()
    if (text.includes(marker)) return true
  }

  return false
}

test('full route mounts the client-only chart during startup', async ({
  page,
}) => {
  await page.goto(`/full${fastSearch}`)
  await waitForStartup(page)
  await expectChartHydrated(page, true)
  await expect(page.getByTestId('chart-widget')).toBeVisible()
  await clickShellAndExpectCount(page, '1')
  await clickChartAndExpectCount(page, '1')
})

test('visible route keeps the SSR skeleton and loads chart JavaScript after scroll', async ({
  page,
  request,
}) => {
  await page.goto(`/defer-visible${fastSearch}`)
  await waitForStartup(page)

  await expectChartHydrated(page, false)
  await expect(page.getByTestId('chart-skeleton')).toBeVisible()
  await expect(
    resourceContentsContain(page, request, chartChildMarker),
  ).resolves.toBe(false)

  await scrollToChart(page)
  await expectChartHydrated(page, true)
  await expect(page.getByTestId('chart-widget')).toBeVisible()
  await expect
    .poll(() => resourceContentsContain(page, request, chartChildMarker))
    .toBe(true)
  await clickChartAndExpectCount(page, '1')
})

test('visible prefetch route downloads chart code before hydration', async ({
  page,
  request,
}) => {
  await page.goto(`/defer-visible-prefetch${fastSearch}`)
  await waitForStartup(page)

  await expectChartHydrated(page, false)
  await expect
    .poll(() => resourceContentsContain(page, request, chartChildMarker), {
      timeout: 10_000,
    })
    .toBe(true)

  await scrollToChart(page)
  await expectChartHydrated(page, true)
  await clickChartAndExpectCount(page, '1')
})

test('runtime-only route eagerly loads chart code but delays hydration', async ({
  page,
  request,
}) => {
  await page.goto(`/defer-runtime-only${fastSearch}`)
  await waitForStartup(page)

  await expectChartHydrated(page, false)
  await expect(
    resourceContentsContain(page, request, chartChildMarker),
  ).resolves.toBe(true)

  await scrollToChart(page)
  await expectChartHydrated(page, true)
  await clickChartAndExpectCount(page, '1')
})

test('SSR full route hydrates the real report table during startup', async ({
  page,
}) => {
  await page.goto(`/ssr-full${fastSearch}`)
  await waitForStartup(page)
  await expectTableHydrated(page, true)
  await expect(page.getByTestId('ssr-table-region')).toContainText(
    'Interactive pipeline grid',
  )
  await clickShellAndExpectCount(page, '1')
  await clickTableAndExpectCount(page, '1')
})

test('SSR visible route keeps table HTML static and loads table JavaScript after scroll', async ({
  page,
  request,
}) => {
  await page.goto(`/ssr-defer-visible${fastSearch}`)
  await waitForStartup(page)

  await expectTableHydrated(page, false)
  await expect(page.getByTestId('ssr-table-region')).toContainText(
    'Interactive pipeline grid',
  )
  await expect(
    resourceContentsContain(page, request, tableChildMarker),
  ).resolves.toBe(false)

  await scrollToTable(page)
  await expectTableHydrated(page, true)
  await expect
    .poll(() => resourceContentsContain(page, request, tableChildMarker))
    .toBe(true)
  await clickTableAndExpectCount(page, '1')
})

test('SSR visible prefetch route downloads table code before visible hydration', async ({
  page,
  request,
}) => {
  await page.goto(`/ssr-defer-visible-prefetch${fastSearch}`)
  await waitForStartup(page)

  await expectTableHydrated(page, false)
  await expect
    .poll(() => resourceContentsContain(page, request, tableChildMarker), {
      timeout: 10_000,
    })
    .toBe(true)

  await scrollToTable(page)
  await expectTableHydrated(page, true)
  await clickTableAndExpectCount(page, '1')
})

test('SSR runtime-only route eagerly loads table code but delays hydration', async ({
  page,
  request,
}) => {
  await page.goto(`/ssr-defer-runtime-only${fastSearch}`)
  await waitForStartup(page)

  await expectTableHydrated(page, false)
  await expect(
    resourceContentsContain(page, request, tableChildMarker),
  ).resolves.toBe(true)

  await scrollToTable(page)
  await expectTableHydrated(page, true)
  await clickTableAndExpectCount(page, '1')
})

test('SSR interaction route hydrates the table on first click intent', async ({
  page,
  request,
}) => {
  await page.goto(`/ssr-defer-interaction${fastSearch}`)
  await waitForStartup(page)

  await expectTableHydrated(page, false)
  await expect(
    resourceContentsContain(page, request, tableChildMarker),
  ).resolves.toBe(false)

  await scrollToTable(page)
  await page
    .getByTestId('ssr-table-region')
    .click({ position: { x: 8, y: 8 } })
  await expectTableHydrated(page, true)
  await expect
    .poll(() => resourceContentsContain(page, request, tableChildMarker))
    .toBe(true)
  await clickTableAndExpectCount(page, '1')
})
