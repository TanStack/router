import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import type { Response } from '@playwright/test'

// A Vue single-file component with a server fn in its plain <script> block
// and an isomorphic fn in <script setup>: the page calls the server fn, runs
// the isomorphic fn's client implementation, and no JavaScript the page
// loads holds the server code (the handler's text, the server
// implementation).
test('a server fn of a Vue SFC answers the page, and its server code stays on the server', async ({
  page,
}) => {
  const scripts: Array<Response> = []
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') {
      scripts.push(response)
    }
  })
  await page.goto('/vue-sfc')
  await expect(page.getByTestId('sfc-server-fn')).toHaveText(
    'vue-sfc-server-secret',
  )
  await expect(page.getByTestId('sfc-isomorphic')).toHaveText('client')
  const loaded = await Promise.all(scripts.map((script) => script.text()))
  // the SFC's own client code is among them
  expect(loaded.some((code) => code.includes('sfc-isomorphic'))).toBe(true)
  for (const code of loaded) {
    expect(code).not.toContain('vue-sfc-server-secret')
    expect(code).not.toContain('vue-sfc-server-implementation')
  }
})
