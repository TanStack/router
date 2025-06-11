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

test.describe('params operations + prefix/suffix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/params-ps')
  })

  test.describe('named params', () => {
    const NAMED_PARAMS_PAIRS = [
      // Test ID | Expected href
      {
        id: 'l-to-named-foo',
        pathname: '/params-ps/named/foo',
        params: { foo: 'foo' },
        destHeadingId: 'ParamsNamedFoo',
      },
      {
        id: 'l-to-named-prefixfoo',
        pathname: '/params-ps/named/prefixfoo',
        params: { foo: 'foo' },
        destHeadingId: 'ParamsNamedFooPrefix',
      },
      {
        id: 'l-to-named-foosuffix',
        pathname: '/params-ps/named/foosuffix',
        params: { foo: 'foo' },
        destHeadingId: 'ParamsNamedFooSuffix',
      },
    ] satisfies Array<{
      id: string
      pathname: string
      params: Record<string, string>
      destHeadingId: string
    }>

    test.describe('Link', () => {
      NAMED_PARAMS_PAIRS.forEach(({ id, pathname }) => {
        test(`interpolation for testid="${id}" has href="${pathname}"`, async ({
          page,
        }) => {
          const link = page.getByTestId(id)
          await expect(link).toHaveAttribute('href', pathname)
        })
      })

      NAMED_PARAMS_PAIRS.forEach(({ id, pathname }) => {
        test(`navigation for testid="${id}" succeeds to href="${pathname}"`, async ({
          page,
        }) => {
          const link = page.getByTestId(id)
          await link.click()
          await page.waitForLoadState('networkidle')
          const pagePathname = new URL(page.url()).pathname
          expect(pagePathname).toBe(pathname)
        })
      })
    })

    NAMED_PARAMS_PAIRS.forEach(({ pathname, params, destHeadingId }) => {
      test(`on first-load to "${pathname}" has correct params`, async ({
        page,
      }) => {
        await page.goto(pathname)
        await page.waitForLoadState('networkidle')
        const pagePathname = new URL(page.url()).pathname
        expect(pagePathname).toBe(pathname)

        const headingEl = page.getByRole('heading', { name: destHeadingId })
        await expect(headingEl).toBeVisible()

        const paramsEl = page.getByTestId('params-output')
        const paramsText = await paramsEl.innerText()
        const paramsObj = JSON.parse(paramsText)
        expect(paramsObj).toEqual(params)
      })
    })
  })

  test.describe('wildcard param', () => {
    const WILDCARD_PARAM_PAIRS = [
      // Test ID | Expected href
      {
        id: 'l-to-wildcard-foo',
        pathname: '/params-ps/wildcard/foo',
        params: { '*': 'foo', _splat: 'foo' },
        destHeadingId: 'ParamsWildcardSplat',
      },
      {
        id: 'l-to-wildcard-prefixfoo',
        pathname: '/params-ps/wildcard/prefixfoo',
        params: { '*': 'foo', _splat: 'foo' },
        destHeadingId: 'ParamsWildcardSplatPrefix',
      },
      {
        id: 'l-to-wildcard-foosuffix',
        pathname: '/params-ps/wildcard/foosuffix',
        params: { '*': 'foo', _splat: 'foo' },
        destHeadingId: 'ParamsWildcardSplatSuffix',
      },
    ] satisfies Array<{
      id: string
      pathname: string
      params: Record<string, string>
      destHeadingId: string
    }>

    test.describe('Link', () => {
      WILDCARD_PARAM_PAIRS.forEach(({ id, pathname }) => {
        test(`interpolation for testid="${id}" has href="${pathname}"`, async ({
          page,
        }) => {
          const link = page.getByTestId(id)
          await expect(link).toHaveAttribute('href', pathname)
        })
      })

      WILDCARD_PARAM_PAIRS.forEach(({ id, pathname }) => {
        test(`navigation for testid="${id}" succeeds to href="${pathname}"`, async ({
          page,
        }) => {
          const link = page.getByTestId(id)
          await link.click()
          await page.waitForLoadState('networkidle')
          const pagePathname = new URL(page.url()).pathname
          expect(pagePathname).toBe(pathname)
        })
      })
    })

    WILDCARD_PARAM_PAIRS.forEach(({ pathname, params, destHeadingId }) => {
      test(`on first-load to "${pathname}" has correct params`, async ({
        page,
      }) => {
        await page.goto(pathname)
        await page.waitForLoadState('networkidle')
        const pagePathname = new URL(page.url()).pathname
        expect(pagePathname).toBe(pathname)

        const headingEl = page.getByRole('heading', { name: destHeadingId })
        await expect(headingEl).toBeVisible()

        const paramsEl = page.getByTestId('params-output')
        const paramsText = await paramsEl.innerText()
        const paramsObj = JSON.parse(paramsText)
        expect(paramsObj).toEqual(params)
      })
    })
  })
})
