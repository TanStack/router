import { expect } from '@playwright/test'
import { test } from './fixture'

test.describe('Encoding', () => {
  test('asserts dehydration script is injected before </head> when no charset is present', async ({
    page,
  }) => {
    // In this test setup, the no-charset route does not have a charset meta tag.
    const response = await page.goto('/no-charset')
    const html = await response?.text()

    expect(html).toBeDefined()
    if (!html) return

    // Case-insensitive search for charset meta, TSR script, and closing head tag
    const htmlLower = html.toLowerCase()
    const charsetIndex = htmlLower.search(/<meta\s+charset=(["'])utf-8\1/)
    const tsrScriptIndex = htmlLower.search(/<script\s+class=(["'])\$tsr\1/)
    const headEndIndex = htmlLower.indexOf('</head>')

    // Charset should NOT exist, but the TSR script and head tag should
    expect(charsetIndex).toBe(-1)
    expect(tsrScriptIndex).toBeGreaterThan(-1)
    expect(headEndIndex).toBeGreaterThan(-1)

    // In the fallback case, the TSR dehydration script should appear BEFORE the closing </head> tag.
    expect(tsrScriptIndex).toBeLessThan(headEndIndex)
  })

  test('asserts charset meta tag appears before dehydration script when present on a route', async ({
    page,
  }) => {
    // This route specifically adds a charset meta tag.
    const response = await page.goto('/charset')
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

    // The charset meta tag should appear BEFORE the TSR dehydration script.
    expect(charsetIndex).toBeLessThan(tsrScriptIndex)
  })
})
