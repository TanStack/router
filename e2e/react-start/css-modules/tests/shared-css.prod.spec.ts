import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Page } from '@playwright/test'

test.skip(
  process.env.VITE_CSS_CODE_SPLIT === 'false',
  'Route stylesheet isolation requires CSS code splitting',
)
test.use({ javaScriptEnabled: false })

async function getStylesheetContent(page: Page) {
  const hrefs = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((links: Array<HTMLLinkElement>) =>
      links.map((link) => link.href),
    )
  expect(hrefs.length).toBeGreaterThan(0)
  const stylesheets = await Promise.all(
    hrefs.map(async (href) => {
      const response = await page.request.get(href)
      expect(response.ok()).toBe(true)
      return response.text()
    }),
  )
  return stylesheets.join('\n')
}

for (const route of ['alpha', 'beta']) {
  test(`${route} has complete and isolated CSS without JavaScript`, async ({
    page,
  }) => {
    await page.goto(`/${route}`)

    const header = page.getByTestId('shared-header')
    await expect(header).toHaveCSS('display', 'grid')
    await expect(header).toHaveCSS('height', '64px')
    await expect(page.getByTestId('route-page')).toHaveCSS(
      `--repro-${route}`,
      '1',
    )

    const css = await getStylesheetContent(page)
    expect(css).toContain('--repro-shared-header')
    expect(css).toContain(`--repro-${route}`)
    expect(css).not.toContain(`--repro-${route === 'alpha' ? 'beta' : 'alpha'}`)
  })
}

function getScriptPreloadHrefs(html: string) {
  return Array.from(html.matchAll(/<link\b[^>]*>/g), (match) => match[0])
    .filter(
      (tag) =>
        /\brel="modulepreload"/.test(tag) ||
        (/\brel="preload"/.test(tag) && /\bas="script"/.test(tag)),
    )
    .map((tag) => tag.match(/\bhref="([^"]+)"/)?.[1])
    .filter((href): href is string => !!href)
}

test('alpha preloads the shared header chunk and the chunk it depends on', async ({
  page,
}) => {
  const response = await page.request.get('/alpha')
  expect(response.ok()).toBe(true)

  const hrefs = getScriptPreloadHrefs(await response.text())
  expect(hrefs.length).toBeGreaterThan(0)

  const scripts = await Promise.all(
    hrefs.map(async (href) => {
      const script = await page.request.get(href)
      expect(script.ok()).toBe(true)
      return script.text()
    }),
  )

  expect(scripts.some((code) => code.includes('shared-header'))).toBe(true)
  expect(scripts.some((code) => code.includes('repro-format-title'))).toBe(true)
})

test('home does not load the shared header or route styles', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByTestId('global-styled')).toHaveCSS(
    'background-color',
    'rgb(59, 130, 246)',
  )

  const css = await getStylesheetContent(page)
  expect(css).not.toContain('--repro-shared-header')
  expect(css).not.toContain('--repro-alpha')
  expect(css).not.toContain('--repro-beta')
})
