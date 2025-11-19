import { test as base, expect } from '@playwright/test'

export interface TestFixtureOptions {
  whitelistErrors: Array<RegExp | string>
}
export const test = base.extend<TestFixtureOptions>({
  whitelistErrors: [[], { option: true }],
  page: async ({ page, whitelistErrors }, use) => {
    const errorMessages: Array<string> = []
    page.on('console', (m) => {
      if (m.type() === 'error') {
        const text = m.text()
        for (const whitelistError of whitelistErrors) {
          if (
            (typeof whitelistError === 'string' &&
              text.includes(whitelistError)) ||
            (whitelistError instanceof RegExp && whitelistError.test(text))
          ) {
            return
          }
        }
        errorMessages.push(text)
      }
    })
    await use(page)
    expect(errorMessages).toEqual([])
  },
})
