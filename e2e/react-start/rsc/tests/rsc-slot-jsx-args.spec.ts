import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test.describe('RSC Slot Arg Tests - JSX element argument', () => {
  test('Client slot receives and renders JSX arg from server', async ({
    page,
  }) => {
    await page.goto('/rsc-slot-jsx-args')
    await page.waitForURL('/rsc-slot-jsx-args')
    await expect(page.getByTestId('app-hydrated')).toHaveText('hydrated')

    await expect(page.getByTestId('rsc-jsx-args-server')).toBeVisible()
    await expect(page.getByTestId('rsc-jsx-args-client')).toBeVisible()

    await expect(page.getByTestId('promo-cta-jsx')).toBeVisible()
    await expect(page.getByTestId('promo-cta-jsx')).toHaveText('Limited offer')
    await expect(page.getByTestId('rsc-jsx-args-meta')).toContainText('CMP-123')
  })
})
