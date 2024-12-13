import { expect, test } from '@playwright/test'
import combinateImport from 'combinate'
import { derivePort } from '../../../utils'
import packageJson from '../package.json' with { type: 'json' }

// somehow playwright does not correctly import default exports
const combinate = (combinateImport as any).default as typeof combinateImport

const PORT = derivePort(packageJson.name)

test.describe('redirects', () => {
  const internalNavigationTestMatrix = combinate({
    thrower: ['beforeLoad', 'loader'] as const,
    reloadDocument: [false, true] as const,
    preload: [false, true] as const,
  })

  internalNavigationTestMatrix.forEach(
    ({ thrower, reloadDocument, preload }) => {
      test(`internal target, navigation: thrower: ${thrower}, reloadDocument: ${reloadDocument}, preload: ${preload}`, async ({
        page,
      }) => {
        await page.waitForLoadState('networkidle')
        await page.goto(
          `/redirect/internal${preload === false ? '?preload=false' : ''}`,
        )
        const link = page.getByTestId(
          `via-${thrower}${reloadDocument ? '-reloadDocument' : ''}`,
        )

        await page.waitForLoadState('networkidle')
        let requestHappened = false

        const requestPromise = new Promise<void>((resolve) => {
          page.on('request', (request) => {
            if (
              request.url() === 'https://jsonplaceholder.typicode.com/posts'
            ) {
              requestHappened = true
              resolve()
            }
          })
        })
        await link.focus()

        const expectRequestHappened = preload && !reloadDocument
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(resolve, expectRequestHappened ? 5000 : 500),
        )
        await Promise.race([requestPromise, timeoutPromise])
        expect(requestHappened).toBe(expectRequestHappened)
        await link.click()
        let fullPageLoad = false
        page.on('domcontentloaded', () => {
          fullPageLoad = true
        })

        const url = `http://localhost:${PORT}/posts`

        await page.waitForURL(url)
        expect(page.url()).toBe(url)
        await expect(page.getByTestId('PostsIndexComponent')).toBeInViewport()
        expect(fullPageLoad).toBe(reloadDocument)
      })
    },
  )

  const internalDirectVisitTestMatrix = combinate({
    thrower: ['beforeLoad', 'loader'] as const,
    reloadDocument: [false, true] as const,
    preload: [false, true] as const,
  })

  internalDirectVisitTestMatrix.forEach(
    ({ thrower, reloadDocument, preload }) => {
      test(`internal target, direct visit: thrower: ${thrower}, reloadDocument: ${reloadDocument}, preload: ${preload}`, async ({
        page,
      }) => {
        await page.waitForLoadState('networkidle')

        await page.goto(`/redirect/internal/via-${thrower}`)

        const url = `http://localhost:${PORT}/posts`

        await page.waitForURL(url)
        expect(page.url()).toBe(url)
        await page.waitForLoadState('networkidle')
        await expect(page.getByTestId('PostsIndexComponent')).toBeInViewport()
      })
    },
  )

  const externalTestMatrix = combinate({
    scenario: ['navigate', 'direct_visit'] as const,
    thrower: ['beforeLoad', 'loader'] as const,
  })

  externalTestMatrix.forEach(({ scenario, thrower }) => {
    test(`external target: scenario: ${scenario}, thrower: ${thrower}`, async ({
      page,
    }) => {
      await page.waitForLoadState('networkidle')

      if (scenario === 'navigate') {
        await page.goto(`/redirect/external`)
        await page.getByTestId(`via-${thrower}`).click()
      } else {
        await page.goto(`/redirect/external/via-${thrower}`)
      }

      const url = 'http://example.com/'

      await page.waitForURL(url)
      expect(page.url()).toBe(url)
    })
  })
})
