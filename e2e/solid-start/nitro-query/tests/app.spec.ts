import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('direct visit to a createQuery route renders without SSR error', async ({
  page,
}) => {
  const errors: Array<string> = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto('/')

  await expect(page.getByTestId('query-data')).toHaveText('ok')
  expect(errors.join('\n')).not.toContain('defaultQueryOptions')
})
