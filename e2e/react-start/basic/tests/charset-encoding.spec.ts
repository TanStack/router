import { expect } from '@playwright/test'
import { test } from './fixture'

test.describe('Charset Encoding', () => {
  test('documents charset meta tag ordering issue in server-rendered HTML', async ({
    page,
  }) => {
    // Navigate to a server-rendered page to get the HTML with dehydration scripts
    const response = await page.goto('/')
    const html = await response?.text()

    expect(html).toBeDefined()
    if (!html) return

    // Case-insensitive search for charset meta and TSR script
    const htmlLower = html.toLowerCase()
    const charsetIndex = htmlLower.search(/<meta\s+charset=(["'])utf-8\1/)
    const tsrScriptIndex = htmlLower.search(/<script\s+class=(["'])\$tsr\1/)

    // Both should exist in server-rendered HTML with dehydration
    expect(charsetIndex).toBeGreaterThan(-1)
    expect(tsrScriptIndex).toBeGreaterThan(-1)

    // CURRENT ISSUE: TSR dehydration script appears BEFORE charset meta tag
    // This can cause encoding issues when the script contains non-ASCII characters
    // According to HTML5 spec, charset should appear before any content requiring encoding
    //
    // This test documents the current (incorrect) behavior
    expect(tsrScriptIndex).toBeLessThan(charsetIndex)

    // TODO: Once fixed, change to: expect(charsetIndex).toBeLessThan(tsrScriptIndex)
  })
})
