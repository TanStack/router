import { expect, test } from '@playwright/test'

test.describe('params operations + prefix/suffix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/params')
  })

  test.describe('named params', () => {
    const NAMED_PARAMS_PAIRS = [
      // Test ID | Expected href
      {
        id: 'l-to-named-foo',
        pathname: '/params/named/foo',
        params: { foo: 'foo' },
      },
      {
        id: 'l-to-named-prefixfoo',
        pathname: '/params/named/prefixfoo',
        params: { foo: 'foo' },
      },
      {
        id: 'l-to-named-foosuffix',
        pathname: '/params/named/foosuffix',
        params: { foo: 'foo' },
      },
    ] satisfies Array<{
      id: string
      pathname: string
      params: Record<string, string>
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

    NAMED_PARAMS_PAIRS.forEach(({ pathname, params }) => {
      test(`on first-load to "${pathname}" has correct params`, async ({
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
      {
        id: 'l-to-wildcard-foo',
        pathname: '/params/wildcard/foo',
        params: { '*': 'foo', _splat: 'foo' },
      },
      {
        id: 'l-to-wildcard-prefixfoo',
        pathname: '/params/wildcard/prefixfoo',
        params: { '*': 'foo', _splat: 'foo' },
      },
      {
        id: 'l-to-wildcard-foosuffix',
        pathname: '/params/wildcard/foosuffix',
        params: { '*': 'foo', _splat: 'foo' },
      },
    ] satisfies Array<{
      id: string
      pathname: string
      params: Record<string, string>
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

    WILDCARD_PARAM_PAIRS.forEach(({ pathname, params }) => {
      test(`on first-load to "${pathname}" has correct params`, async ({
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
