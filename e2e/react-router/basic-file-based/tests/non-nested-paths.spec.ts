import { expect, test } from '@playwright/test'
import { useExperimentalNonNestedRoutes } from './utils/useExperimentalNonNestedRoutes'

const testCases: Array<{
  name: string
  testPathDesc: string
  testPathPrefix: string
  testPathSuffix: string
  paramValue: Record<string, string>
  paramValue2: Record<string, string>
}> = [
  {
    name: 'Named path params',
    testPathDesc: 'named',
    testPathPrefix: '',
    testPathSuffix: '',
    paramValue: { baz: 'baz' },
    paramValue2: { baz: 'baz_' },
  },
  {
    name: 'prefix params',
    testPathPrefix: 'prefix',
    testPathSuffix: '',
    testPathDesc: 'prefix',
    paramValue: { baz: 'baz' },
    paramValue2: { baz: 'baz_' },
  },
  {
    name: 'suffix params',
    testPathPrefix: '',
    testPathSuffix: 'suffix',
    testPathDesc: 'suffix',
    paramValue: { baz: 'baz' },
    paramValue2: { baz: 'baz2' },
  },
  {
    name: 'path',
    testPathPrefix: '',
    testPathSuffix: '',
    testPathDesc: 'path',
    paramValue: {},
    paramValue2: {},
  },
]

test.describe('Non-nested paths', () => {
  testCases.forEach(
    ({
      name,
      testPathDesc,
      testPathPrefix,
      testPathSuffix,
      paramValue,
      paramValue2,
    }) => {
      test.describe(name, () => {
        const path = `/non-nested/${testPathDesc}`
        const paramNameDesc = Object.keys(paramValue)[0] ?? 'baz'

        test.beforeEach(async ({ page }) => {
          await page.goto('/non-nested')
          await page.waitForURL('/non-nested')
        })

        test('Should not un-nest nested paths', async ({ page }) => {
          const nonNestedPathHeading = page.getByTestId(
            'non-nested-path-heading',
          )
          await expect(nonNestedPathHeading).toBeVisible()

          await page.getByTestId(`l-to-${testPathDesc}`).click()
          await page.waitForURL(path)

          const rootRouteHeading = page.getByTestId(
            `non-nested-${testPathDesc}-root-route-heading`,
          )

          await expect(rootRouteHeading).toBeVisible()

          const pathRouteHeading = page.getByTestId(
            `non-nested-${testPathDesc}-${paramNameDesc}-route-heading`,
          )

          const indexHeading = page.getByTestId(
            `non-nested-${testPathDesc}-${paramNameDesc}-index-heading`,
          )

          const fooHeading = page.getByTestId(
            `non-nested-${testPathDesc}-${paramNameDesc}-foo-heading`,
          )

          const indexParams = page.getByTestId(
            `non-nested-${testPathDesc}-${paramNameDesc}-index-param`,
          )

          const fooParams = page.getByTestId(
            `non-nested-${testPathDesc}-${paramNameDesc}-foo-param`,
          )

          const indexLink = page.getByTestId(`to-${testPathDesc}-index`)
          const fooLink = page.getByTestId(`to-${testPathDesc}-foo`)
          const foo2Link = page.getByTestId(`to-${testPathDesc}-foo-2`)

          const indexPath = `${path}/${testPathPrefix}${paramValue[paramNameDesc] ?? 'baz'}${testPathSuffix}`
          const fooPath = `${path}/${testPathPrefix}${paramValue[paramNameDesc] ?? 'baz'}${testPathSuffix}/foo`
          const foo2Path = `${path}/${testPathPrefix}${paramValue2[paramNameDesc] ?? 'baz'}${testPathSuffix}/foo`

          console.log(await indexLink.getAttribute('href'))
          await expect(indexLink).toHaveAttribute('href', indexPath)
          await expect(fooLink).toHaveAttribute('href', fooPath)
          await expect(foo2Link).toHaveAttribute('href', foo2Path)

          await indexLink.click()
          await page.waitForURL(indexPath)
          await expect(rootRouteHeading).toBeVisible()
          await expect(pathRouteHeading).toBeVisible()
          await expect(indexHeading).toBeVisible()
          const indexParamValue = await indexParams.innerText()
          expect(JSON.parse(indexParamValue)).toEqual(paramValue)

          await fooLink.click()
          await page.waitForURL(fooPath)
          await expect(rootRouteHeading).toBeVisible()
          await expect(pathRouteHeading).toBeVisible()
          await expect(fooHeading).toBeVisible()
          const fooParamValue = await fooParams.innerText()
          expect(JSON.parse(fooParamValue)).toEqual(paramValue)

          await foo2Link.click()
          await page.waitForURL(foo2Path)
          await expect(rootRouteHeading).toBeVisible()
          await expect(pathRouteHeading).toBeVisible()
          await expect(fooHeading).toBeVisible()
          const foo2ParamValue = await fooParams.innerText()
          expect(JSON.parse(foo2ParamValue)).toEqual(paramValue2)
        })

        test('Should not nest non-nested paths', async ({ page }) => {
          const nonNestedPathHeading = page.getByTestId(
            'non-nested-path-heading',
          )
          await expect(nonNestedPathHeading).toBeVisible()

          await page.getByTestId(`l-to-${testPathDesc}`).click()
          await page.waitForURL(path)

          const rootRouteHeading = page.getByTestId(
            `non-nested-${testPathDesc}-root-route-heading`,
          )

          await expect(rootRouteHeading).toBeVisible()

          const pathRouteHeading = page.getByTestId(
            `non-nested-${testPathDesc}-${paramNameDesc}-route-heading`,
          )

          const barHeading = page.getByTestId(
            `non-nested-${testPathDesc}-${paramNameDesc}-bar-heading`,
          )

          const barParams = page.getByTestId(
            `non-nested-${testPathDesc}-${paramNameDesc}-bar-param`,
          )

          const barLink = page.getByTestId(`to-${testPathDesc}-bar`)
          const bar2Link = page.getByTestId(`to-${testPathDesc}-bar-2`)

          const barPath = `${path}/${testPathPrefix}${paramValue[paramNameDesc] ?? 'baz'}${testPathSuffix}/bar`
          const bar2Path = `${path}/${testPathPrefix}${paramValue2[paramNameDesc] ?? 'baz'}${testPathSuffix}/bar`
          await expect(barLink).toHaveAttribute('href', barPath)

          await expect(bar2Link).toHaveAttribute('href', bar2Path)

          await barLink.click()
          await page.waitForURL(barPath)
          await expect(rootRouteHeading).toBeVisible()
          await expect(pathRouteHeading).not.toBeVisible()
          await expect(barHeading).toBeVisible()
          const barParamValue = await barParams.innerText()
          expect(JSON.parse(barParamValue)).toEqual(paramValue)

          await bar2Link.click()
          await page.waitForURL(bar2Path)
          await expect(rootRouteHeading).toBeVisible()
          await expect(pathRouteHeading).not.toBeVisible()
          await expect(barHeading).toBeVisible()
          const bar2ParamValue = await barParams.innerText()
          if (useExperimentalNonNestedRoutes || testPathDesc !== 'named') {
            expect(JSON.parse(bar2ParamValue)).toEqual(paramValue2)
          } else {
            // this is a bug with named path params and non-nested paths
            // that is resolved in the new experimental flag
            expect(JSON.parse(bar2ParamValue)).toEqual(paramValue)
          }
        })
      })
    },
  )
})
