import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import {
  DEPLOYMENT_ID,
  HEADER_CARRIER,
  MISSING,
} from '../src/deployment-metadata.config'
import type { Page } from '@playwright/test'

const deploymentMetadataEnabled = process.env.E2E_DEPLOYMENT_METADATA !== 'off'

async function gotoHydrated(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('hydrated')).toBeAttached()
}

test.describe('deployment metadata', () => {
  test.skip(!deploymentMetadataEnabled)

  for (const method of ['post', 'get'] as const) {
    test(`attaches the header carrier to ${method.toUpperCase()} server functions`, async ({
      page,
    }) => {
      await gotoHydrated(page)

      const request = page.waitForRequest((request) =>
        request.url().includes('/_serverFn/'),
      )
      await page.getByTestId(`call-${method}`).click()

      expect((await request).headers()[HEADER_CARRIER]).toBe(DEPLOYMENT_ID)
      await expect(page.getByTestId(`result-${method}`)).toHaveText(
        DEPLOYMENT_ID,
      )
    })
  }

  test('does not attach the carrier to non-server-function requests', async ({
    page,
  }) => {
    await gotoHydrated(page)

    const request = page.waitForRequest((request) =>
      request.url().includes('/api/user-fetch'),
    )
    await page.getByTestId('call-user-fetch').click()

    expect((await request).headers()[HEADER_CARRIER]).toBeUndefined()
    await expect(page.getByTestId('result-user-fetch')).toHaveText(MISSING)
  })
})

test.describe('no deployment metadata', () => {
  test.skip(deploymentMetadataEnabled)

  for (const method of ['post', 'get'] as const) {
    test(`does not attach a carrier to ${method.toUpperCase()} server functions`, async ({
      page,
    }) => {
      await gotoHydrated(page)

      const request = page.waitForRequest((request) =>
        request.url().includes('/_serverFn/'),
      )
      await page.getByTestId(`call-${method}`).click()

      expect((await request).headers()[HEADER_CARRIER]).toBeUndefined()
      await expect(page.getByTestId(`result-${method}`)).toHaveText(MISSING)
    })
  }
})
