import { expect, test } from '@playwright/test'

test.describe('skipRouteOnParseError (file-based)', () => {
  const UUID_VALUE = '123e4567-e89b-12d3-a456-426614174000'
  const NUMERIC_VALUE = '12345'
  const STRING_VALUE = 'hello-world'

  test.describe('direct URL navigation', () => {
    test('navigating to UUID value matches UUID route', async ({ page }) => {
      await page.goto(`/skip-on-parse-error/${UUID_VALUE}`)
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('UUID Route')

      const paramValue = page.getByTestId('param-value')
      await expect(paramValue).toHaveText(UUID_VALUE)
    })

    test('navigating to numeric value matches Numeric route', async ({
      page,
    }) => {
      await page.goto(`/skip-on-parse-error/${NUMERIC_VALUE}`)
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('Numeric Route')

      const paramValue = page.getByTestId('param-value')
      await expect(paramValue).toHaveText(NUMERIC_VALUE)

      // Verify the param was parsed as a number
      const paramType = page.getByTestId('param-type')
      await expect(paramType).toHaveText('Type: number')
    })

    test('navigating to string value matches Catch-all route', async ({
      page,
    }) => {
      await page.goto(`/skip-on-parse-error/${STRING_VALUE}`)
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('Catch-all Route')

      const paramValue = page.getByTestId('param-value')
      await expect(paramValue).toHaveText(STRING_VALUE)
    })

    test('navigating to another UUID matches UUID route', async ({ page }) => {
      const anotherUuid = 'a1b2c3d4-e5f6-1234-89ab-cdef01234567'
      await page.goto(`/skip-on-parse-error/${anotherUuid}`)
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('UUID Route')
    })

    test('navigating to zero matches Numeric route', async ({ page }) => {
      await page.goto('/skip-on-parse-error/0')
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('Numeric Route')

      const paramValue = page.getByTestId('param-value')
      await expect(paramValue).toHaveText('0')
    })

    test('navigating to negative number matches Numeric route', async ({
      page,
    }) => {
      // -123 parses to -123, and "-123" === "-123" check passes
      await page.goto('/skip-on-parse-error/-123')
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('Numeric Route')
    })

    test('navigating to float matches Catch-all route', async ({ page }) => {
      // 123.45 won't match numeric because parseInt("123.45") === 123, and "123" !== "123.45"
      await page.goto('/skip-on-parse-error/123.45')
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('Catch-all Route')
    })

    test('navigating to UUID-like but invalid format matches Catch-all', async ({
      page,
    }) => {
      // Invalid UUID (wrong version digit)
      const invalidUuid = '123e4567-e89b-9999-a456-426614174000'
      await page.goto(`/skip-on-parse-error/${invalidUuid}`)
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('Catch-all Route')
    })
  })

  test.describe('client-side navigation via Link', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/skip-on-parse-error')
      await page.waitForLoadState('networkidle')
    })

    test('clicking UUID link navigates to UUID route', async ({ page }) => {
      const link = page.getByTestId('link-to-uuid')
      await link.click()
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('UUID Route')

      const paramValue = page.getByTestId('param-value')
      await expect(paramValue).toHaveText(UUID_VALUE)
    })

    test('clicking Numeric link navigates to Numeric route', async ({
      page,
    }) => {
      const link = page.getByTestId('link-to-numeric')
      await link.click()
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('Numeric Route')

      const paramValue = page.getByTestId('param-value')
      await expect(paramValue).toHaveText(NUMERIC_VALUE)
    })

    test('clicking String link navigates to Catch-all route', async ({
      page,
    }) => {
      const link = page.getByTestId('link-to-string')
      await link.click()
      await page.waitForLoadState('networkidle')

      const routeType = page.getByTestId('route-type')
      await expect(routeType).toHaveText('Catch-all Route')

      const paramValue = page.getByTestId('param-value')
      await expect(paramValue).toHaveText(STRING_VALUE)
    })
  })

  test.describe('Link href generation', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/skip-on-parse-error')
      await page.waitForLoadState('networkidle')
    })

    test('UUID link has correct href', async ({ page }) => {
      const link = page.getByTestId('link-to-uuid')
      await expect(link).toHaveAttribute(
        'href',
        `/skip-on-parse-error/${UUID_VALUE}`,
      )
    })

    test('Numeric link has correct href', async ({ page }) => {
      const link = page.getByTestId('link-to-numeric')
      await expect(link).toHaveAttribute(
        'href',
        `/skip-on-parse-error/${NUMERIC_VALUE}`,
      )
    })

    test('String link has correct href', async ({ page }) => {
      const link = page.getByTestId('link-to-string')
      await expect(link).toHaveAttribute(
        'href',
        `/skip-on-parse-error/${STRING_VALUE}`,
      )
    })
  })
})
