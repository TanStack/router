import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('preserves absent and explicit sendContext through SSR and client calls', async ({
  page,
}) => {
  await page.goto('/send-context-contract')
  await expect(page.getByTestId('send-context-loader')).toHaveText(
    'absent,empty,nonempty',
  )
  await page.getByTestId('invoke-send-context-contract').click()
  await expect(page.getByTestId('send-context-client')).toHaveText(
    'absent,empty,nonempty',
  )
})
