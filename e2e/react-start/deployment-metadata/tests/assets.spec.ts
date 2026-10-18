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
})

test.describe('no deployment metadata assets', () => {
  test.skip(deploymentMetadataEnabled)

  test('does not tag built asset urls', async ({ page }) => {
    const urls = await loadAssetUrls(page)

    for (const [index, asset] of assets.entries()) {
      expect(urls[index].search, `${asset.name}: ${urls[index]}`).toBe('')
    }
  })
})
