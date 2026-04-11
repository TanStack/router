import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

test.skip(process.env.MODE === 'dev', 'Prod-only manifest dehydration coverage')

const ROOT_SHELL_COLOR = 'rgb(22, 101, 52)'
const ROUTE_ONE_COLOR = 'rgb(30, 64, 175)'
const ROUTE_TWO_COLOR = 'rgb(126, 34, 206)'

const buildUrl = (baseURL: string, pathname: string) =>
  baseURL.replace(/\/$/, '') + pathname

async function getColor(testId: string, page: Page) {
  return page
    .getByTestId(testId)
    .evaluate((element) => getComputedStyle(element).color)
}

function getStylesheetHrefsFromHtml(html: string) {
  return Array.from(
    html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
    (match) => match[1]!,
  )
}

async function getHeadStylesheetHrefs(page: Page) {
  return page.locator('head link[rel="stylesheet"]').evaluateAll((links) => {
    return links.map(
      (link) => (link as HTMLLinkElement).getAttribute('href') || '',
    )
  })
}

function countMatchingStylesheetHrefs(hrefs: Array<string>, pattern: string) {
  return hrefs.filter((href) => href.includes(pattern)).length
}

async function loadBuiltStartManifest() {
  const serverDir = path.resolve(import.meta.dirname, '../.output/server')
  const entries = await readdir(serverDir)
  const manifestFile = entries.find(
    (entry) =>
      entry.startsWith('_tanstack-start-manifest_v-') && entry.endsWith('.mjs'),
  )

  expect(manifestFile).toBeTruthy()

  const moduleUrl = `${pathToFileURL(path.join(serverDir, manifestFile!)).href}?t=${Date.now()}`
  const manifestModule = await import(moduleUrl)

  return manifestModule.tsrStartManifest() as {
    routes: Record<string, { assets?: Array<unknown> }>
  }
}

async function expectDirectEntry({
  page,
  request,
  baseURL,
  pathname,
  expectedVisibleTestId,
  expectedAbsentTestId,
  expectedStylesheetPattern,
  unexpectedStylesheetPattern,
  expectedColorTestId,
  expectedColor,
}: {
  page: Page
  request: {
    get: (url: string) => Promise<{ ok(): boolean; text(): Promise<string> }>
  }
  baseURL: string
  pathname: string
  expectedVisibleTestId: string
  expectedAbsentTestId: string
  expectedStylesheetPattern: string
  unexpectedStylesheetPattern: string
  expectedColorTestId: string
  expectedColor: string
}) {
  const url = buildUrl(baseURL, pathname)
  const response = await request.get(url)
  const ssrHtml = await response.text()

  expect(response.ok()).toBe(true)
  expect(ssrHtml).toContain('root-shell-marker')
  expect(ssrHtml).toContain(expectedVisibleTestId)
  expect(ssrHtml).not.toContain(expectedAbsentTestId)

  const stylesheetLinks = getStylesheetHrefsFromHtml(ssrHtml)

  expect(
    countMatchingStylesheetHrefs(stylesheetLinks, expectedStylesheetPattern),
  ).toBe(1)
  expect(
    countMatchingStylesheetHrefs(stylesheetLinks, unexpectedStylesheetPattern),
  ).toBe(0)
  expect(stylesheetLinks).toHaveLength(2)

  await page.goto(url)
  await expect(page.getByTestId(expectedVisibleTestId)).toBeVisible()
  await expect(page.getByTestId('hydration-marker')).toBeVisible()

  await expect
    .poll(async () => {
      const hrefs = await getHeadStylesheetHrefs(page)
      return countMatchingStylesheetHrefs(hrefs, expectedStylesheetPattern)
    })
    .toBe(1)
  await expect
    .poll(async () => {
      const hrefs = await getHeadStylesheetHrefs(page)
      return countMatchingStylesheetHrefs(hrefs, unexpectedStylesheetPattern)
    })
    .toBe(0)

  await expect
    .poll(() => getColor('root-shell-marker', page))
    .toBe(ROOT_SHELL_COLOR)
  await expect
    .poll(() => getColor(expectedColorTestId, page))
    .toBe(expectedColor)
}

test('SSR and client navigation keep CSS module styles correct without hydration errors', async ({
  page,
  baseURL,
  request,
}) => {
  const routeOneUrl = buildUrl(baseURL!, '/r1')
  const response = await request.get(routeOneUrl)
  const ssrHtml = await response.text()

  expect(response.ok()).toBe(true)
  expect(ssrHtml).toContain('root-shell-marker')
  expect(ssrHtml).toContain('route-r1-card')
  expect(ssrHtml).not.toContain('route-r2-card')

  const stylesheetLinks = getStylesheetHrefsFromHtml(ssrHtml)

  expect(countMatchingStylesheetHrefs(stylesheetLinks, 'r1-')).toBe(1)
  expect(countMatchingStylesheetHrefs(stylesheetLinks, 'r2-')).toBe(0)
  expect(stylesheetLinks).toHaveLength(2)

  await page.goto(routeOneUrl)

  await expect(page.getByTestId('route-r1-card')).toBeVisible()
  await expect(page.getByTestId('hydration-marker')).toBeVisible()

  await expect
    .poll(async () => {
      const hrefs = await getHeadStylesheetHrefs(page)
      return countMatchingStylesheetHrefs(hrefs, 'r1-')
    })
    .toBe(1)
  await expect
    .poll(async () => {
      const hrefs = await getHeadStylesheetHrefs(page)
      return countMatchingStylesheetHrefs(hrefs, 'r2-')
    })
    .toBe(0)

  await expect
    .poll(() => getColor('root-shell-marker', page))
    .toBe(ROOT_SHELL_COLOR)
  await expect.poll(() => getColor('route-r1-card', page)).toBe(ROUTE_ONE_COLOR)

  await page.getByTestId('nav-/r2').click()
  await page.waitForURL('**/r2')
  await expect(page.getByTestId('route-r2-card')).toBeVisible()

  await expect
    .poll(async () => {
      const hrefs = await getHeadStylesheetHrefs(page)
      return countMatchingStylesheetHrefs(hrefs, 'r2-')
    })
    .toBe(1)

  await expect
    .poll(() => getColor('root-shell-marker', page))
    .toBe(ROOT_SHELL_COLOR)
  await expect.poll(() => getColor('route-r2-card', page)).toBe(ROUTE_TWO_COLOR)

  await page.getByTestId('nav-/r1').click()
  await page.waitForURL('**/r1')
  await expect(page.getByTestId('route-r1-card')).toBeVisible()

  await expect
    .poll(async () => {
      const hrefs = await getHeadStylesheetHrefs(page)
      return countMatchingStylesheetHrefs(hrefs, 'r1-')
    })
    .toBe(1)

  await expect
    .poll(() => getColor('root-shell-marker', page))
    .toBe(ROOT_SHELL_COLOR)
  await expect.poll(() => getColor('route-r1-card', page)).toBe(ROUTE_ONE_COLOR)
})

test('direct SSR entry on /r2 only includes its stylesheet and hydrates cleanly', async ({
  page,
  baseURL,
  request,
}) => {
  await expectDirectEntry({
    page,
    request,
    baseURL: baseURL!,
    pathname: '/r2',
    expectedVisibleTestId: 'route-r2-card',
    expectedAbsentTestId: 'route-r1-card',
    expectedStylesheetPattern: 'r2-',
    unexpectedStylesheetPattern: 'r1-',
    expectedColorTestId: 'route-r2-card',
    expectedColor: ROUTE_TWO_COLOR,
  })
})

test('direct SSR entries on different route-css pages stay isolated', async ({
  page,
  baseURL,
  request,
}) => {
  await expectDirectEntry({
    page,
    request,
    baseURL: baseURL!,
    pathname: '/r2',
    expectedVisibleTestId: 'route-r2-card',
    expectedAbsentTestId: 'route-r1-card',
    expectedStylesheetPattern: 'r2-',
    unexpectedStylesheetPattern: 'r1-',
    expectedColorTestId: 'route-r2-card',
    expectedColor: ROUTE_TWO_COLOR,
  })

  await expectDirectEntry({
    page,
    request,
    baseURL: baseURL!,
    pathname: '/r1',
    expectedVisibleTestId: 'route-r1-card',
    expectedAbsentTestId: 'route-r2-card',
    expectedStylesheetPattern: 'r1-',
    unexpectedStylesheetPattern: 'r2-',
    expectedColorTestId: 'route-r1-card',
    expectedColor: ROUTE_ONE_COLOR,
  })
})

test('home route only renders the root stylesheet and no route-specific CSS', async ({
  page,
  baseURL,
  request,
}) => {
  const homeUrl = buildUrl(baseURL!, '/')
  const response = await request.get(homeUrl)
  const ssrHtml = await response.text()

  expect(response.ok()).toBe(true)
  expect(ssrHtml).toContain('root-shell-marker')
  expect(ssrHtml).toContain('home-copy')
  expect(ssrHtml).not.toContain('route-r1-card')
  expect(ssrHtml).not.toContain('route-r2-card')

  const stylesheetLinks = getStylesheetHrefsFromHtml(ssrHtml)

  expect(countMatchingStylesheetHrefs(stylesheetLinks, 'r1-')).toBe(0)
  expect(countMatchingStylesheetHrefs(stylesheetLinks, 'r2-')).toBe(0)
  expect(stylesheetLinks).toHaveLength(1)

  await page.goto(homeUrl)
  await expect(page.getByTestId('home-copy')).toBeVisible()
  await expect(page.getByTestId('hydration-marker')).toBeVisible()

  await expect
    .poll(async () => {
      const hrefs = await getHeadStylesheetHrefs(page)
      return countMatchingStylesheetHrefs(hrefs, 'r1-')
    })
    .toBe(0)
  await expect
    .poll(async () => {
      const hrefs = await getHeadStylesheetHrefs(page)
      return countMatchingStylesheetHrefs(hrefs, 'r2-')
    })
    .toBe(0)

  await expect
    .poll(() => getColor('root-shell-marker', page))
    .toBe(ROOT_SHELL_COLOR)
})

test('built start manifest preserves shared layout asset identity across sibling routes', async ({
  page,
  baseURL,
}) => {
  await page.goto(buildUrl(baseURL!, '/shared-a'))
  await expect(page.getByTestId('shared-a-card')).toBeVisible()

  const manifest = await loadBuiltStartManifest()

  const sharedAAsset = manifest.routes['/shared-a']?.assets?.[0]
  const sharedBAsset = manifest.routes['/shared-b']?.assets?.[0]
  const sharedCAsset = manifest.routes['/shared-c']?.assets?.[0]

  expect(sharedAAsset).toBeTruthy()
  expect(sharedAAsset).toBe(sharedBAsset)
  expect(sharedBAsset).toBe(sharedCAsset)
})
