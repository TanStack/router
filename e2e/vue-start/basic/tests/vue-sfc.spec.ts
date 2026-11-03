import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

// A Vue single-file component's <script setup> block with a server fn and
// an isomorphic fn: the page calls the server fn, runs the isomorphic fn's
// client implementation, and no JavaScript the page loads holds the server
// code (the handler's text, the server implementation).
test('a server fn of a Vue SFC answers the page, and its server code stays on the server', async ({
  page,
}) => {
  const scripts: Array<Promise<string>> = []
  page.on('response', (response) => {
    if (/javascript/.test(response.headers()['content-type'] ?? '')) {
      scripts.push(response.text().catch(() => ''))
    }
  })
  await page.goto('/vue-sfc')
  await expect(page.getByTestId('sfc-server-fn')).toHaveText(
    'vue-sfc-server-secret',
  )
  await expect(page.getByTestId('sfc-isomorphic')).toHaveText('client')
  const loaded = await Promise.all(scripts)
  expect(loaded.length).toBeGreaterThan(0)
  for (const code of loaded) {
    expect(code).not.toContain('vue-sfc-server-secret')
    expect(code).not.toContain('vue-sfc-server-implementation')
  }
})
