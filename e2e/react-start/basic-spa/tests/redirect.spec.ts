import queryString from 'node:querystring'
import { expect } from '@playwright/test'
import combinateImport from 'combinate'
import {
  getDummyServerPort,
  getTestServerPort,
  test,
} from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }

// somehow playwright does not correctly import default exports
const combinate = (combinateImport as any).default as typeof combinateImport

const PORT = await getTestServerPort(packageJson.name)
const EXTERNAL_HOST_PORT = await getDummyServerPort(packageJson.name)

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
              request.url().startsWith(`http://localhost:${PORT}/_serverFn/`)
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
        let fullPageLoad = false
        page.on('domcontentloaded', () => {
          fullPageLoad = true
        })

        await link.click()

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
  })

  internalDirectVisitTestMatrix.forEach(({ thrower, reloadDocument }) => {
    if (process.env.NODE_ENV === 'development') {
      test.use({
        whitelistErrors: [
          /A tree hydrated but some attributes of the server rendered HTML/,
        ],
      })
    }
    test(`internal target, direct visit: thrower: ${thrower}, reloadDocument: ${reloadDocument}`, async ({
      page,
    }) => {
      await page.goto(`/redirect/internal/via-${thrower}`)
      await page.waitForLoadState('networkidle')

      const url = `http://localhost:${PORT}/posts`

      await page.waitForURL(url)
      expect(page.url()).toBe(url)
      await page.waitForLoadState('networkidle')
      await expect(page.getByTestId('PostsIndexComponent')).toBeInViewport()
    })
  })

  const externalTestMatrix = combinate({
    scenario: ['navigate', 'direct_visit'] as const,
    thrower: ['beforeLoad', 'loader'] as const,
  })

  externalTestMatrix.forEach(({ scenario, thrower }) => {
    test(`external target: scenario: ${scenario}, thrower: ${thrower}`, async ({
      page,
    }) => {
      const q = queryString.stringify({
        externalHost: `http://localhost:${EXTERNAL_HOST_PORT}/`,
      })

      if (scenario === 'navigate') {
        await page.goto(`/redirect/external?${q}`)
        await page.waitForLoadState('networkidle')
        const link = page.getByTestId(`via-${thrower}`)
        await link.focus()
        await link.click()
      } else {
        await page.goto(`/redirect/external/via-${thrower}?${q}`)
      }

      const url = `http://localhost:${EXTERNAL_HOST_PORT}/`

      await page.waitForURL(url)
      expect(page.url()).toBe(url)
    })
  })

  const serverFnTestMatrix = combinate({
    target: ['internal', 'external'] as const,
    scenario: ['navigate', 'direct_visit'] as const,
    thrower: ['beforeLoad', 'loader'] as const,
    reloadDocument: [false, true] as const,
  })

  serverFnTestMatrix.forEach(
    ({ target, thrower, scenario, reloadDocument }) => {
      test(`serverFn redirects to target: ${target}, scenario: ${scenario}, thrower: ${thrower}, reloadDocument: ${reloadDocument}`, async ({
        page,
      }) => {
        let fullPageLoad = false
        const q = queryString.stringify({
          externalHost: `http://localhost:${EXTERNAL_HOST_PORT}/`,
          reloadDocument,
        })

        if (scenario === 'navigate') {
          await page.goto(`/redirect/${target}/serverFn?${q}`)
          await page.waitForLoadState('networkidle')
          const link = page.getByTestId(
            `via-${thrower}${reloadDocument ? '-reloadDocument' : ''}`,
          )
          page.on('domcontentloaded', () => {
            fullPageLoad = true
          })
          await link.focus()
          await link.click()
        } else {
          await page.goto(`/redirect/${target}/serverFn/via-${thrower}?${q}`)
        }

        const url =
          target === 'internal'
            ? `http://localhost:${PORT}/posts`
            : `http://localhost:${EXTERNAL_HOST_PORT}/`
        await page.waitForURL(url)
        expect(page.url()).toBe(url)
        if (target === 'internal' && scenario === 'navigate') {
          await expect(page.getByTestId('PostsIndexComponent')).toBeInViewport()
          expect(fullPageLoad).toBe(reloadDocument)
        }
      })
    },
  )

  const useServerFnTestMatrix = combinate({
    target: ['internal', 'external'] as const,
    reloadDocument: [false, true] as const,
  })

  useServerFnTestMatrix.forEach(({ target, reloadDocument }) => {
    test(`useServerFn redirects to target: ${target}, reloadDocument: ${reloadDocument}`, async ({
      page,
    }) => {
      const q = queryString.stringify({
        externalHost: `http://localhost:${EXTERNAL_HOST_PORT}/`,
        reloadDocument,
      })

      await page.goto(`/redirect/${target}/serverFn/via-useServerFn?${q}`)

      await page.waitForLoadState('networkidle')

      const button = page.getByTestId('redirect-on-click')

      let fullPageLoad = false
      page.on('domcontentloaded', () => {
        fullPageLoad = true
      })

      await button.click()

      const url =
        target === 'internal'
          ? `http://localhost:${PORT}/posts`
          : `http://localhost:${EXTERNAL_HOST_PORT}/`
      await page.waitForURL(url)
      expect(page.url()).toBe(url)
      if (target === 'internal') {
        await expect(page.getByTestId('PostsIndexComponent')).toBeInViewport()
        expect(fullPageLoad).toBe(reloadDocument)
      }
    })
  })
})
