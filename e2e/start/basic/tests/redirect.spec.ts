import { expect } from '@playwright/test'
import combinateImport from 'combinate'
import { derivePort, localDummyServer } from '@tanstack/router-e2e-utils'
import packageJson from '../package.json' with { type: 'json' }
import { test } from './fixture'
import { Server } from 'node:http'
import queryString from 'node:querystring'

// somehow playwright does not correctly import default exports
const combinate = (combinateImport as any).default as typeof combinateImport

const PORT = derivePort(packageJson.name)
const EXTERNAL_HOST_PORT = derivePort(`${packageJson.name}-external`)

test.describe('redirects', () => {
  let server: Server
  test.beforeAll(async () => {
    server = await localDummyServer(EXTERNAL_HOST_PORT)
  })
  test.afterAll(async () => {
    server.close()
  })

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
            if (request.url().startsWith(`http://localhost:${PORT}/_server/`)) {
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
    test(`internal target, direct visit: thrower: ${thrower}, reloadDocument: ${reloadDocument}`, async ({
      page,
    }) => {
      await page.goto(`/redirect/internal/via-${thrower}`)

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
      let q = queryString.stringify({
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
        let q = queryString.stringify({
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
      await page.goto(
        `/redirect/${target}/serverFn/via-useServerFn${reloadDocument ? '?reloadDocument=true' : ''}`,
      )
      const button = page.getByTestId('redirect-on-click')

      let fullPageLoad = false
      page.on('domcontentloaded', () => {
        fullPageLoad = true
      })

      await button.click()

      const url =
        target === 'internal'
          ? `http://localhost:${PORT}/posts`
          : 'http://example.com/'
      await page.waitForURL(url)
      expect(page.url()).toBe(url)
      if (target === 'internal') {
        await expect(page.getByTestId('PostsIndexComponent')).toBeInViewport()
        expect(fullPageLoad).toBe(reloadDocument)
      }
    })
  })

  test('throw redirect in route component', async ({ page }) => {
    await page.goto(`/redirect/component/first`)
    await page.waitForURL('/redirect/component/second')
    await expect(page.getByTestId('second')).toBeInViewport()
  })
})
