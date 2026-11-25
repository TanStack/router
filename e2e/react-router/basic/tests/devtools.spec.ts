import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

const modes = ['panel', 'shadow', 'shadow-auto', 'floating'] as const

async function openDevtools(page: Page, mode: (typeof modes)[number]) {
  await page.goto(mode === 'floating' ? '/' : `/?devtools=${mode}`)
  if (mode === 'floating') {
    await page
      .getByRole('button', { name: 'Open TanStack Router Devtools' })
      .click()
  }

  return page.locator('.TanStackRouterDevtoolsPanel')
}

for (const mode of modes) {
  test(`devtools preserve typography and explorer indentation in ${mode} mode`, async ({
    page,
  }) => {
    const panel = await openDevtools(page, mode)
    const router = panel.getByRole('button', { name: /^Router\s*\d+ items/ })
    const state = panel.getByRole('button', { name: /^state\s*\d+ items/ })
    await expect(router).toBeVisible()
    await expect(state).toBeVisible()
    await expect(router).toHaveCSS('font-size', '12px')
    await expect(router).toHaveCSS('gap', '4px')
    await expect(
      panel.getByText('Pathname', { exact: true }).locator('..'),
    ).toHaveCSS('padding-left', '8px')

    const routerBox = await router.boundingBox()
    const stateBox = await state.boundingBox()
    expect(stateBox!.x - routerBox!.x).toBe(18)

    if (mode !== 'floating') {
      await page.addStyleTag({ content: ':root { font-size: 20px; }' })
      await expect(router).toHaveCSS('font-size', '15px')
      await expect(router).toHaveCSS('gap', '5px')

      await page.addStyleTag({
        content: ':root { --tsrd-font-size: 24px; }',
      })
      await expect(router).toHaveCSS('font-size', '18px')
      await expect(router).toHaveCSS('gap', '6px')
    }
  })

  test(`devtools are styled under a CSP that blocks inline style elements in ${mode} mode`, async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === '/',
      async (route) => {
        const response = await route.fetch()
        await route.fulfill({
          response,
          headers: {
            ...response.headers(),
            'content-security-policy': "style-src-elem 'self'",
          },
        })
      },
    )

    const panel = await openDevtools(page, mode)
    const router = panel.getByRole('button', { name: /^Router\s*\d+ items/ })
    await expect(router).toBeVisible()
    await expect(router).toHaveCSS('font-size', '12px')
    await expect(router).toHaveCSS('gap', '4px')
  })
}
