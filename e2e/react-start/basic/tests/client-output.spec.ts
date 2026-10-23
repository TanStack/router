import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test.skip(
  process.env.E2E_TOOLCHAIN !== 'rsbuild' || process.env.MODE !== 'ssr',
  'Client output assertions only run in rsbuild/ssr modes',
)

test('SSR HTML emits scripts and preloads matching the client output format', async ({
  page,
}) => {
  const response = await page.goto('/posts')
  const html = await response!.text()

  const clientEntry = html.match(
    /<script\b[^>]+src="([^"]*\/assets\/js\/index[^"]*)"[^>]*>/,
  )
  expect(clientEntry).toBeTruthy()
  if (process.env.TSS_RSB_CLIENT_OUTPUT === 'iife') {
    expect(html).not.toContain('rel="modulepreload"')
    expect(html).toMatch(/<link[^>]+rel="preload"[^>]+as="script"/)
    expect(clientEntry![0]).toContain('async')
    expect(clientEntry![0]).not.toContain('type="module"')
  } else {
    expect(html).toContain('rel="modulepreload"')
    expect(clientEntry![0]).toContain('type="module"')
  }

  await expect(
    page.getByRole('link', { name: 'sunt aut facere repe' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'sunt aut facere repe' }).click()

  await expect(page.getByRole('heading')).toContainText('sunt aut facere')
})
