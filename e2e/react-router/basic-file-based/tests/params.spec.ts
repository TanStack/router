import { expect, test } from '@playwright/test'
import { useExperimentalNonNestedRoutes } from './utils/useExperimentalNonNestedRoutes'
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

test.describe('params operations + non-nested routes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/params-ps/non-nested')
  })

  test('useParams must resolve non-nested path params', async ({ page }) => {
    await page.waitForURL('/params-ps/non-nested')

    const fooBarLink = page.getByTestId('l-to-non-nested-foo-bar')

    const foo2Bar2Link = page.getByTestId('l-to-non-nested-foo2-bar2')

    await expect(fooBarLink).toHaveAttribute(
      'href',
      '/params-ps/non-nested/foo/bar',
    )

    await fooBarLink.click()
    await page.waitForURL('/params-ps/non-nested/foo/bar')
    const pagePathname = new URL(page.url()).pathname
    expect(pagePathname).toBe('/params-ps/non-nested/foo/bar')

    const fooParamsValue = page.getByTestId('foo-params-value')
    const fooParamsText = await fooParamsValue.innerText()
    const fooParamsObj = JSON.parse(fooParamsText)
    expect(fooParamsObj).toEqual({ foo: 'foo' })

    const paramsValue = page.getByTestId('foo-bar-params-value')
    const paramsText = await paramsValue.innerText()
    const paramsObj = JSON.parse(paramsText)
    expect(paramsObj).toEqual({ foo: 'foo', bar: 'bar' })

    await expect(foo2Bar2Link).toHaveAttribute(
      'href',
      '/params-ps/non-nested/foo2/bar2',
    )
    await foo2Bar2Link.click()
    await page.waitForURL('/params-ps/non-nested/foo2/bar2')
    const pagePathname2 = new URL(page.url()).pathname
    expect(pagePathname2).toBe('/params-ps/non-nested/foo2/bar2')

    const foo2ParamsValue = page.getByTestId('foo-params-value')
    const foo2ParamsText = await foo2ParamsValue.innerText()
    const foo2ParamsObj = JSON.parse(foo2ParamsText)
    if (useExperimentalNonNestedRoutes) {
      expect(foo2ParamsObj).toEqual({ foo: 'foo2' })
    } else {
      // this is a bug that is resolved in the new experimental flag
      expect(foo2ParamsObj).toEqual({ foo: 'foo' })
    }

    const params2Value = page.getByTestId('foo-bar-params-value')
    const params2Text = await params2Value.innerText()
    const params2Obj = JSON.parse(params2Text)
    if (useExperimentalNonNestedRoutes) {
      expect(params2Obj).toEqual({ foo: 'foo2', bar: 'bar2' })
    } else {
      // this is a bug that is resolved in the new experimental flag
      expect(params2Obj).toEqual({ foo: 'foo', bar: 'bar2' })
    }
  })
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

    test(`ensure use params doesn't cause excess renders and is stable across various usage options`, async ({
      page,
    }) => {
      await page.goto('/params-ps/named/foo')
      await page.waitForLoadState('networkidle')

      const pagePathname = new URL(page.url()).pathname
      expect(pagePathname).toBe('/params-ps/named/foo')

      const fooRenderCount = page.getByTestId('foo-render-count')
      const fooIndexLink = page.getByTestId('params-foo-links-index')
      const fooBar1Link = page.getByTestId('params-foo-links-bar1')
      const fooBar2Link = page.getByTestId('params-foo-links-bar2')
      const fooBarBazLink = page.getByTestId('params-foo-bar-links-baz')
      const fooValue = page.getByTestId('params-output')
      const fooBarValue = page.getByTestId('foo-bar-value')
      const fooBazInBarValue = page.getByTestId('foo-baz-in-bar-value')
      const fooBarRenderCount = page.getByTestId('foo-bar-render-count')
      const fooBarBazValue = page.getByTestId('foo-bar-baz-value')

      await expect(fooRenderCount).toBeInViewport()
      await expect(fooValue).toBeInViewport()
      await expect(fooIndexLink).toBeInViewport()
      await expect(fooBar1Link).toBeInViewport()
      await expect(fooBar2Link).toBeInViewport()
      await expect(fooRenderCount).toHaveText('1')
      await expect(fooValue).toHaveText(JSON.stringify({ foo: 'foo' }))

      await fooBar1Link.click()
      await page.waitForLoadState('networkidle')
      await expect(fooValue).toBeInViewport()
      await expect(fooRenderCount).toBeInViewport()
      await expect(fooBarRenderCount).toBeInViewport()
      await expect(fooBarValue).toBeInViewport()
      await expect(fooBazInBarValue).toBeInViewport()
      await expect(fooBarBazLink).toBeInViewport()
      await expect(fooValue).toHaveText(JSON.stringify({ foo: 'foo' }))
      await expect(fooRenderCount).toHaveText('1')
      await expect(fooBarRenderCount).toHaveText('1')
      await expect(fooBarValue).toHaveText('1')
      await expect(fooBazInBarValue).toHaveText('no param')

      await fooBarBazLink.click()
      await page.waitForLoadState('networkidle')
      await expect(fooValue).toBeInViewport()
      await expect(fooRenderCount).toBeInViewport()
      await expect(fooBarRenderCount).toBeInViewport()
      await expect(fooBarValue).toBeInViewport()
      await expect(fooBazInBarValue).toBeInViewport()
      await expect(fooValue).toHaveText(JSON.stringify({ foo: 'foo' }))
      await expect(fooRenderCount).toHaveText('1')
      await expect(fooBarRenderCount).toHaveText('2')
      await expect(fooBarValue).toHaveText('1')
      await expect(fooBazInBarValue).toHaveText('1_10')
      await expect(fooBarBazValue).toHaveText('1_10')

      await fooBar2Link.click()
      await page.waitForLoadState('networkidle')
      await expect(fooValue).toBeInViewport()
      await expect(fooRenderCount).toBeInViewport()
      await expect(fooBarValue).toBeInViewport()
      await expect(fooValue).toHaveText(JSON.stringify({ foo: 'foo' }))
      await expect(fooRenderCount).toHaveText('1')
      await expect(fooBarValue).toHaveText('2')

      await fooIndexLink.click()
      await page.waitForLoadState('networkidle')
      await expect(fooValue).toBeInViewport()
      await expect(fooRenderCount).toBeInViewport()
      await expect(fooBarValue).not.toBeInViewport()
      await expect(fooValue).toHaveText(JSON.stringify({ foo: 'foo' }))
      await expect(fooRenderCount).toHaveText('1')
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

test.describe('Unicode route rendering', () => {
  test('should render non-latin route correctly', async ({ page, baseURL }) => {
    await page.goto('/대한민국')

    await expect(page.locator('body')).toContainText('Hello "/대한민국"!')

    expect(page.url()).toBe(`${baseURL}/%EB%8C%80%ED%95%9C%EB%AF%BC%EA%B5%AD`)
  })
})
