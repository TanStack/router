import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

for (const mode of ['panel', 'shadow', 'floating']) {
  test(`devtools preserve typography and explorer indentation in ${mode} mode`, async ({
    page,
  }) => {
    await page.goto(mode === 'floating' ? '/' : `/?devtools=${mode}`)
    if (mode === 'floating') {
      await page
        .getByRole('button', { name: 'Open TanStack Router Devtools' })
        .click()
    }

    const panel = page.locator('.TanStackRouterDevtoolsPanel')
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
}
