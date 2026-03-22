import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('returns correct runtime info', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('message')).toContainText('Running in Node.js')
  await expect(page.getByTestId('runtime')).toHaveText('Nitro')
})

test('prerender with Nitro', async ({ page }) => {
  const distDir = join(process.cwd(), '.output', 'public')
  const staticHtmlPath = join(distDir, 'static', 'index.html')
  expect(existsSync(staticHtmlPath)).toBe(true)
  const staticHtml = readFileSync(staticHtmlPath, 'utf8')
  const normalizedHtml = staticHtml.replace(/<!--.*?-->/g, '')
  expect(normalizedHtml).toContain('This page was prerendered with Nitro')

  await page.goto('/static')
  await expect(page.getByTestId('static-heading')).toHaveText('Static Page')
  await expect(page.getByTestId('static-content')).toHaveText(
    'This page was prerendered with Nitro',
  )
})

test('client-side navigation works', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('message')).toContainText('Running in Node.js')

  await page.getByRole('link', { name: 'Static' }).click()
  await expect(page.getByTestId('static-heading')).toHaveText('Static Page')

  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByTestId('message')).toContainText('Running in Node.js')
})
