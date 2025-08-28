import { expect } from '@playwright/test'
import { test } from './fixture'

test.describe('Charset Encoding', () => {
  test('asserts charset meta tag appears before dehydration script', async ({
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

    // With the fix, the charset meta tag should now appear BEFORE the TSR dehydration script.
    // This ensures correct character encoding and compliance with the HTML5 spec.
    expect(charsetIndex).toBeLessThan(tsrScriptIndex)
  })
})
