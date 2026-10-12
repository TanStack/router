import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('canonicalizes search before SSR without rerunning the loader during hydration', async ({
  page,
}) => {
  const serverFnRequests: Array<string> = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/_serverFn/')) {
      serverFnRequests.push(request.url())
    }
  })

  const response = await page.goto('/?q=a%2Ab')
  expect(response?.status()).toBe(200)
  const redirectedFrom = response!.request().redirectedFrom()
  expect(redirectedFrom?.url()).toMatch(/\/\?q=a%2Ab$/)
  expect((await redirectedFrom!.response())?.status()).toBe(307)
  expect(redirectedFrom!.redirectedFrom()).toBeNull()
  await expect(page).toHaveURL(/\/\?q=a\*b$/)
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true')
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('loader-runtime')).toHaveText('server')
  await expect(page.getByTestId('loader-data')).toHaveText('loaded')
  expect(serverFnRequests).toEqual([])
})

test('hydrates a noncanonical form POST without submitting it again', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true')

  const posts: Array<string> = []
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.method() === 'POST') {
      posts.push(request.url())
    }
  })

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().isNavigationRequest() &&
      response.request().method() === 'POST',
  )
  await page.evaluate(() => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/?q=a%2Ab'
    const input = document.createElement('input')
    input.name = 'message'
    input.value = 'write once'
    form.append(input)
    document.body.append(form)
    form.submit()
  })

  const response = await responsePromise
  expect(response.status()).toBe(200)
  expect(response.headers().location).toBeUndefined()
  expect(response.request().redirectedFrom()).toBeNull()
  await expect(page).toHaveURL(/\/\?q=a\*b$/)
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true')
  await expect(page.getByTestId('loader-data')).toHaveText('loaded')
  await page.waitForLoadState('networkidle')
  expect(posts).toEqual([response.url()])
})

test('a root pendingComponent preserves the SSR document during hydration', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { removed: false }
    ;(window as any).__hydration = state

    new MutationObserver((records) => {
      const ssrNode = (window as any).__ssrNode as Node | undefined
      if (!ssrNode) {
        return
      }

      for (const record of records) {
        for (const removedNode of record.removedNodes) {
          if (
            removedNode === ssrNode ||
            (removedNode instanceof Element && removedNode.contains(ssrNode))
          ) {
            state.removed = true
          }
        }
      }
    }).observe(document, { childList: true, subtree: true })
  })

  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true')

  expect(
    await page.evaluate(() => ({
      captured: !!(window as any).__ssrNode,
      removed: (window as any).__hydration.removed,
      replaced:
        (window as any).__ssrNode !==
        document.querySelector('[data-testid="ssr-node"]'),
    })),
  ).toEqual({
    captured: true,
    removed: false,
    replaced: false,
  })
})
