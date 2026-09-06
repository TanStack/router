import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export async function waitForHydration(page: Page) {
  await expect(page.getByTestId('hydrated')).toHaveText('hydrated', {
    timeout: 15000,
  })
}
