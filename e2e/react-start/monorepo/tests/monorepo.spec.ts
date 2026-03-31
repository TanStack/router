import { expect, Page } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

type NavigationMethod = 'direct' | 'client-side'

async function navigateToRoute(
  page: Page,
  route: string,
  linkTestId: string,
  method: NavigationMethod,
) {
  if (method === 'direct') {
    await page.goto(route)
  } else {
    // Client-side navigation: go to home first, then click link
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByTestId(linkTestId).click()
  }
  await page.waitForLoadState('networkidle')
}

test.describe('Monorepo: startInstance.createServerFn context', () => {
  test.describe('direct navigation (SSR)', () => {
    test('getAnalyticsContext receives locale and userId from global request middleware', async ({
      page,
    }) => {
      await navigateToRoute(
        page,
        '/analytics-context',
        'link-analytics-context',
        'direct',
      )

      await expect(page.getByTestId('locale')).toHaveText('en-us')
      await expect(page.getByTestId('userId')).toHaveText('user-42')
    })
  })

  test.describe('client-side navigation', () => {
    test('getAnalyticsContext receives locale and userId from global request middleware', async ({
      page,
    }) => {
      await navigateToRoute(
        page,
        '/analytics-context',
        'link-analytics-context',
        'client-side',
      )

      await expect(page.getByTestId('locale')).toHaveText('en-us')
      await expect(page.getByTestId('userId')).toHaveText('user-42')
    })
  })
})

test.describe('Monorepo: startInstance.createMiddleware context', () => {
  test.describe('direct navigation (SSR)', () => {
    test('getAnalyticsSession receives locale, userId, and sessionId from global + local middleware', async ({
      page,
    }) => {
      await navigateToRoute(
        page,
        '/analytics-session',
        'link-analytics-session',
        'direct',
      )

      await expect(page.getByTestId('locale')).toHaveText('en-us')
      await expect(page.getByTestId('userId')).toHaveText('user-42')
      await expect(page.getByTestId('sessionId')).toHaveText(
        'session-user-42-en-us',
      )
    })
  })

  test.describe('client-side navigation', () => {
    test('getAnalyticsSession receives locale, userId, and sessionId from global + local middleware', async ({
      page,
    }) => {
      await navigateToRoute(
        page,
        '/analytics-session',
        'link-analytics-session',
        'client-side',
      )

      await expect(page.getByTestId('locale')).toHaveText('en-us')
      await expect(page.getByTestId('userId')).toHaveText('user-42')
      await expect(page.getByTestId('sessionId')).toHaveText(
        'session-user-42-en-us',
      )
    })
  })
})
