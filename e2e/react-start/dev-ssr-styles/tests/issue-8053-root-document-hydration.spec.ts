import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('#8053: a root pendingComponent preserves the SSR document during hydration', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { removed: false }
    ;(window as any).__issue8053Hydration = state

    new MutationObserver((records) => {
      const ssrNode = (window as any).__issue8053SsrNode as Node | undefined
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

  const hydrationErrors: Array<string> = []
  page.on('console', (message) => {
    if (message.type() === 'error') {
      hydrationErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => {
    hydrationErrors.push(error.message)
  })

  const response = await page.goto('/')
  expect(response?.ok()).toBe(true)
  await expect(page.locator('html')).toHaveAttribute('data-hydrated', 'true')

  expect(
    await page.evaluate(() => ({
      captured: !!(window as any).__issue8053SsrNode,
      removed: (window as any).__issue8053Hydration.removed,
      replaced:
        (window as any).__issue8053SsrNode !==
        document.querySelector('[data-testid="issue-8053-ssr-node"]'),
    })),
  ).toEqual({
    captured: true,
    removed: false,
    replaced: false,
  })
  expect(
    hydrationErrors.filter((error) =>
      /hydrat|did not match|server rendered HTML/i.test(error),
    ),
  ).toEqual([])
})
