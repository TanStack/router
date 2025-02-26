import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test.describe('ensure single params have been parsed correctly whilst being stable in the browser', () => {
  const cases = [
    { value: 'hello', expected: 'hello' },
    {
      value: '100%25',
      expected: '100%',
    },
    {
      value: '100%2525',
      expected: '100%25',
    },
    {
      value: '100%26',
      expected: '100&',
    },
  ]

  function getParsedValue(page: Page) {
    return page.getByTestId('parsed-param-value').textContent()
  }

  for (const { value, expected } of cases) {
    test(`navigating to /params/single/${value}`, async ({ page, baseURL }) => {
      await page.goto(`/params/single/${value}`)

      // on the first run, the value should be the same as the expected value
      const valueOnFirstRun = await getParsedValue(page)
      expect(valueOnFirstRun).toBe(expected)

      // the url/pathname should be the same as the expected value
      const urlOnFirstRun = page.url().replace(baseURL!, '')
      expect(urlOnFirstRun).toBe(`/params/single/${value}`)

      // click on the self link to the same value
      await page.getByTestId('self-link-same').click()
      const valueOnSecondRun = await getParsedValue(page)
      expect(valueOnSecondRun).toBe(expected)

      // click on the self link to the amended value
      await page.getByTestId('self-link-amended').click()
      const valueOnThirdRun = await getParsedValue(page)
      expect(valueOnThirdRun).toBe(`e2e${expected}`)

      // the url/pathname should be the same as the expected value
      const urlOnThirdRun = page.url().replace(baseURL!, '')
      expect(urlOnThirdRun).toBe(`/params/single/e2e${value}`)
    })
  }
})
