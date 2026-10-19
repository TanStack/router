import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { DEPLOYMENT_ID, QUERY_CARRIER } from '../src/deployment-metadata.config'
import type { Page } from '@playwright/test'

const deploymentMetadataEnabled = process.env.E2E_DEPLOYMENT_METADATA !== 'off'

const assets = [
  { name: 'css url()', pattern: /\/assets\/background-[^/]*\.svg/ },
  { name: 'js imported asset', pattern: /\/assets\/logo-[^/]*\.svg/ },
  { name: 'stylesheet link', pattern: /\/assets\/app-[^/]*\.css/ },
] as const

async function loadAssetUrls(page: Page) {
  const requests = assets.map((asset) =>
    page.waitForRequest((request) => asset.pattern.test(request.url())),
  )
  await page.goto('/')

  return Promise.all(
    requests.map(async (request) => new URL((await request).url())),
  )
}

async function loadModulePreloadUrls(page: Page) {
  await page.goto('/')

  const hrefs = await page
    .locator('link[rel="modulepreload"]')
    .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href))
  expect(hrefs.length).toBeGreaterThan(0)

  return hrefs.map((href) => new URL(href))
}

test.describe('deployment metadata assets', () => {
  test.skip(!deploymentMetadataEnabled)

  test('tags built asset urls with the query carrier', async ({ page }) => {
    const urls = await loadAssetUrls(page)

    for (const [index, asset] of assets.entries()) {
      expect(
        urls[index].searchParams.get(QUERY_CARRIER),
        `${asset.name}: ${urls[index]}`,
      ).toBe(DEPLOYMENT_ID)
    }
  })

  test('tags modulepreload urls with the query carrier', async ({ page }) => {
    for (const url of await loadModulePreloadUrls(page)) {
      expect(url.searchParams.get(QUERY_CARRIER), `${url}`).toBe(DEPLOYMENT_ID)
    }
  })
})

test.describe('no deployment metadata assets', () => {
  test.skip(deploymentMetadataEnabled)

  test('does not tag built asset urls', async ({ page }) => {
    const urls = await loadAssetUrls(page)

    for (const [index, asset] of assets.entries()) {
      expect(urls[index].search, `${asset.name}: ${urls[index]}`).toBe('')
    }
  })

  test('does not tag modulepreload urls', async ({ page }) => {
    for (const url of await loadModulePreloadUrls(page)) {
      expect(url.search, `${url}`).toBe('')
    }
  })
})
