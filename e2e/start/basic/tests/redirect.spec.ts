import { expect, test } from '@playwright/test'
import combinateImport from 'combinate'

// somehow puppeteer does not correctly import default exports
const combinate = (combinateImport as any).default as typeof combinateImport

test.describe('redirects', () => {
  const testMatrix = combinate({
    scenario: ['navigate', 'direct_visit'] as const,
    target: ['internal', 'external'] as const,
    thrower: ['beforeLoad', 'loader'] as const,
  })

  testMatrix.forEach(({ scenario, target, thrower }) => {
    test(`scenario: ${scenario}, target: ${target}, thrower: ${thrower}`, async ({
      page,
    }) => {
      if (scenario === 'navigate') {
        await page.goto(`/redirect/${target}`)
        await page.getByRole('link', { name: `via-${thrower}` }).click()
      } else {
        await page.goto(`/redirect/${target}/via-${thrower}`)
      }

      const url =
        target === 'internal'
          ? 'http://localhost:3000/posts'
          : 'http://example.com/'
      await page.waitForURL(url)
      expect(page.url()).toBe(url)
    })
  })

  const serverFnTestMatrix = combinate({
    target: ['internal', 'external'] as const,
    thrower: ['beforeLoad', 'loader', 'useServerFn'] as const,
  })

  serverFnTestMatrix.forEach(({ target, thrower }) => {
    test(`serverFn redirects to target: ${target}, thrower: ${thrower}`, async ({
      page,
    }) => {
      await page.goto(`/redirect/${target}/serverFn/via-${thrower}`)
      await page.getByRole('button', { name: 'click me', exact: true }).click()

      const url =
        target === 'internal'
          ? 'http://localhost:3000/posts'
          : 'http://example.com/'
      await page.waitForURL(url)
      expect(page.url()).toBe(url)
    })
  })
})
