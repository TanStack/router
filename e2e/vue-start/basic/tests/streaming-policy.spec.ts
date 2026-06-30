import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

const streamingEntryForm =
  process.env.STREAMING_SSR_ENTRY_FORM ?? 'create-start-handler'

test.describe(`ssr.streaming policy (${streamingEntryForm})`, () => {
  test('resolves render and head channels from the request', async ({
    request,
  }) => {
    const cases = [
      ['all', 'true', 'true'],
      ['none', 'false', 'false'],
      ['render-only', 'true', 'false'],
      ['head-only', 'false', 'true'],
    ] as const

    for (const [mode, render, head] of cases) {
      const response = await request.get(`/streaming-policy?streaming=${mode}`)
      const html = await response.text()

      expect(response.ok()).toBe(true)
      expect(html).toContain(`<div data-testid="policy-render">${render}</div>`)
      expect(html).toContain(`<div data-testid="policy-head">${head}</div>`)
    }
  })

  test.describe('with JavaScript disabled', () => {
    test.use({ javaScriptEnabled: false })

    for (const mode of ['none', 'head-only'] as const) {
      test(`renders the full policy page when streaming=${mode}`, async ({
        page,
      }) => {
        await page.goto(`/streaming-policy?streaming=${mode}`)

        await expect(page.getByTestId('policy-render')).toContainText('false')
        await expect(page.getByTestId('policy-head')).toContainText(
          mode === 'head-only' ? 'true' : 'false',
        )
        await expect(page.getByTestId('policy-immediate')).toContainText(
          'Immediate policy content',
        )
        await expect(page.getByTestId('policy-deferred')).toContainText(
          'Deferred policy content',
        )
      })
    }
  })
})
