import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { awaitHydrated, collectErrors, hydrationErrorPattern } from './utils'

// ============================================================================
// Async dehydrate/hydrate on context and loader
// ============================================================================
test.describe('async codec', () => {
  test('SSR: async dehydrate on the server, async hydrate on the client, hydration completes', async ({
    page,
  }) => {
    await page.goto('/async-codec')
    await awaitHydrated(page)
    await expect(page.getByTestId('ac-heading')).toHaveText('Async codec')

    await expect(page.getByTestId('ac-context-label')).toHaveText(
      'server-ac-context',
    )
    await expect(page.getByTestId('ac-context-stamp')).toHaveText('7')
    await expect(page.getByTestId('ac-context-stamp-type')).toHaveText('number')
    await expect(page.getByTestId('ac-context-via')).toHaveText('async-hydrate')

    await expect(page.getByTestId('ac-loader-title')).toHaveText(
      'server-ac-loader',
    )
    await expect(page.getByTestId('ac-loader-scores')).toHaveText('10|20|30')
    await expect(page.getByTestId('ac-loader-scores-type')).toHaveText('array')
    await expect(page.getByTestId('ac-loader-via')).toHaveText('async-hydrate')
  })

  test('client nav: handlers run locally, codecs are not involved', async ({
    page,
  }) => {
    await page.goto('/')
    await awaitHydrated(page)
    await page.getByTestId('link-async-codec').click()
    await expect(page.getByTestId('ac-heading')).toHaveText('Async codec')
    await expect(page.getByTestId('ac-context-label')).toHaveText(
      'client-ac-context',
    )
    await expect(page.getByTestId('ac-context-via')).toHaveText('handler')
    await expect(page.getByTestId('ac-loader-title')).toHaveText(
      'client-ac-loader',
    )
    await expect(page.getByTestId('ac-loader-via')).toHaveText('handler')
  })

  test('round trip: hydrated context is kept, loader re-runs locally', async ({
    page,
  }) => {
    await page.goto('/async-codec')
    await awaitHydrated(page)
    await expect(page.getByTestId('ac-context-via')).toHaveText('async-hydrate')

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await page.getByTestId('link-async-codec').click()
    await expect(page.getByTestId('ac-heading')).toHaveText('Async codec')
    await expect(page.getByTestId('ac-context-via')).toHaveText('async-hydrate')
    await expect(page.getByTestId('ac-context-label')).toHaveText(
      'server-ac-context',
    )
    await expect(page.getByTestId('ac-loader-via')).toHaveText('handler')
    await expect(page.getByTestId('ac-loader-title')).toHaveText(
      'client-ac-loader',
    )
  })
})

test.describe('codec paths - console', () => {
  test('async codec and dehydrate-partial hydrate without hydration errors', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.goto('/async-codec')
    await awaitHydrated(page)
    await page.goto('/dehydrate-partial/de-DE')
    await awaitHydrated(page)
    expect(errors.filter((e) => hydrationErrorPattern.test(e))).toEqual([])
  })
})
