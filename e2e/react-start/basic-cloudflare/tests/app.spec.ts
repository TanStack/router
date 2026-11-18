import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('returns the correct user agent', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('message')).toHaveText(
    'Running in Cloudflare-Workers',
  )
})

test('returns the correct value from a Cloudflare binding', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByTestId('myVar')).toHaveText('Hello from Cloudflare')
})

test('prerender with Cloudflare Workers runtime', async ({ page }) => {
  // Verify the static page was prerendered during build
  const distDir = join(process.cwd(), 'dist', 'client')
  expect(existsSync(join(distDir, 'static', 'index.html'))).toBe(true)

  // Verify the page loads correctly
  await page.goto('/static')
  await expect(page.getByTestId('static-heading')).toHaveText('Static Page')
  await expect(page.getByTestId('static-content')).toHaveText(
    'The value is Hello from Cloudflare',
  )
})

test('the built Cloudflare app passes a deployment dry run', () => {
  const wrangler = fileURLToPath(
    new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url),
  )
  const output = execFileSync(
    process.execPath,
    [wrangler, 'deploy', '--dry-run'],
    {
      encoding: 'utf8',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  )
  expect(output).toContain('dist/server/wrangler.json')
  expect(output).toContain('--dry-run: exiting now.')
})
