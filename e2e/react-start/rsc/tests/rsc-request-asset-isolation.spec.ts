import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

test('RSC stylesheets stay scoped to each response for the same matched route', async ({
  request,
  page,
}) => {
  const clientDir = join(process.env.E2E_DIST_DIR ?? 'dist', 'client')
  const cssFiles = (await readdir(clientDir, { recursive: true })).filter(
    (file) => file.endsWith('.css'),
  )
  const stylesheets = await Promise.all(
    cssFiles.map(async (file) => ({
      href: '/' + file.split('\\').join('/'),
      css: await readFile(join(clientDir, file), 'utf8'),
    })),
  )
  const orange = stylesheets.filter(({ css }) =>
    /--conditional-variant:\s*orange/.test(css),
  )
  expect(orange).toHaveLength(1)
  const stylesheet = orange[0].href

  for (const branch of ['orange', 'none', 'orange', 'none']) {
    const response = await request.get(`/rsc-css-conditional/${branch}`)
    expect(response.status()).toBe(200)
    const html = await response.text()
    const label = await page.evaluate((html) => {
      const document = new DOMParser().parseFromString(html, 'text/html')
      return document.querySelector(
        '[data-testid="rsc-css-conditional-branch"]',
      )?.textContent
    }, html)
    expect(label).toBe(`Active branch: ${branch}`)

    // Check the complete SSR response, including hydration data: CSS can be
    // replayed by the client even when it is absent from the initial head.
    if (branch === 'orange') {
      expect(html).toContain(stylesheet)
    } else {
      expect(html).not.toContain(stylesheet)
    }
  }
})
