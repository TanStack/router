import { expect, test } from '@playwright/test'

test.describe('params operations + prefix/suffix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/params')
  })

  test.describe('named params', () => {
    const NAMED_PARAMS_PAIRS = [
      // Test ID | Expected href
      ['l-to-named-foo', '/params/named/foo', { foo: 'foo' }],
      ['l-to-named-prefixfoo', '/params/named/prefixfoo', { foo: 'foo' }],
      ['l-to-named-foosuffix', '/params/named/foosuffix', { foo: 'foo' }],
    ] satisfies Array<[string, string, Record<string, string>]>

    test.describe('Link', () => {
      NAMED_PARAMS_PAIRS.forEach(([id, pathname]) => {
        test(`interpolation for testid=${id} has href=${pathname}`, async ({
          page,
        }) => {
          const link = page.getByTestId(id)
          await expect(link).toHaveAttribute('href', pathname)
        })
      })

      NAMED_PARAMS_PAIRS.forEach(([id, pathname]) => {
        test(`navigation for testid=${id} succeeds to href=${pathname}`, async ({
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

    NAMED_PARAMS_PAIRS.forEach(([_, pathname, params]) => {
      test(`on first-load to ${pathname} has correct params`, async ({
        page,
      }) => {
        await page.goto(pathname)
        await page.waitForLoadState('networkidle')
        const pagePathname = new URL(page.url()).pathname
        expect(pagePathname).toBe(pathname)

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
      [
        'l-to-wildcard-foo',
        '/params/wildcard/foo',
        { '*': 'foo', _splat: 'foo' },
      ],
      [
        'l-to-wildcard-prefixfoo',
        '/params/wildcard/prefixfoo',
        { '*': 'foo', _splat: 'foo' },
      ],
      [
        'l-to-wildcard-foosuffix',
        '/params/wildcard/foosuffix',
        { '*': 'foo', _splat: 'foo' },
      ],
    ] satisfies Array<[string, string, Record<string, string>]>

    test.describe('Link', () => {
      WILDCARD_PARAM_PAIRS.forEach(([id, pathname]) => {
        test(`interpolation for testid=${id} has href=${pathname}`, async ({
          page,
        }) => {
          const link = page.getByTestId(id)
          await expect(link).toHaveAttribute('href', pathname)
        })
      })

      WILDCARD_PARAM_PAIRS.forEach(([id, pathname]) => {
        test(`navigation for testid=${id} succeeds to href=${pathname}`, async ({
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

    WILDCARD_PARAM_PAIRS.forEach(([_, pathname, params]) => {
      test(`on first-load to ${pathname} has correct params`, async ({
        page,
      }) => {
        await page.goto(pathname)
        await page.waitForLoadState('networkidle')
        const pagePathname = new URL(page.url()).pathname
        expect(pagePathname).toBe(pathname)

        const paramsEl = page.getByTestId('params-output')
        const paramsText = await paramsEl.innerText()
        const paramsObj = JSON.parse(paramsText)
        expect(paramsObj).toEqual(params)
      })
    })
  })
})
