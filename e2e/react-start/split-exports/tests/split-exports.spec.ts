import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

/**
 * Split Exports Plugin E2E Tests
 *
 * These tests verify that the split-exports plugin correctly:
 * 1. Allows importing isomorphic functions from modules with server-only code
 * 2. Eliminates server-only code from client bundles
 * 3. Server functions and isomorphic functions work correctly
 */

test.describe('Direct Import', () => {
  test('isomorphic functions work correctly on SSR and client', async ({
    page,
  }) => {
    await page.goto('/direct-import')
    await page.waitForLoadState('networkidle')

    // Check constants work
    await expect(page.getByTestId('app-name')).toContainText(
      'Split Exports Test App',
    )
    await expect(page.getByTestId('formatted-name')).toContainText('John Doe')

    // Check SSR results - isomorphic function returned 'server' during SSR
    await expect(page.getByTestId('ssr-env')).toContainText('server')
    // Check that user was loaded from server function
    await expect(page.getByTestId('ssr-user')).toContainText('User 1')

    // Run client tests
    await page.getByTestId('run-client-tests-btn').click()
    await page.waitForLoadState('networkidle')

    // Check client results - isomorphic function returns 'client' on client
    await expect(page.getByTestId('client-env')).toContainText('client')
    // Check message was formatted with client prefix
    await expect(page.getByTestId('client-message')).toContainText('[CLIENT]')
    // Check server function returns 'server' when called from client
    await expect(page.getByTestId('server-env')).toContainText('server')
    // Check server function returned user data
    await expect(page.getByTestId('server-user')).toContainText('User 2')
  })
})

test.describe('Re-export Import', () => {
  test('re-exported isomorphic functions work correctly', async ({ page }) => {
    await page.goto('/reexport-import')
    await page.waitForLoadState('networkidle')

    // Check constants work from re-export
    await expect(page.getByTestId('app-name')).toContainText(
      'Split Exports Test App',
    )

    // Check SSR results
    await expect(page.getByTestId('ssr-env')).toContainText('server')
    // Check users were loaded
    await expect(page.getByTestId('ssr-users')).toContainText('Alice')
    await expect(page.getByTestId('ssr-users')).toContainText('Bob')

    // Run client tests
    await page.getByTestId('run-client-tests-btn').click()
    await page.waitForLoadState('networkidle')

    // Check client results
    await expect(page.getByTestId('client-env')).toContainText('client')
    await expect(page.getByTestId('client-message')).toContainText('[CLIENT]')
    await expect(page.getByTestId('server-env')).toContainText('server')
  })
})

test.describe('Alias Import', () => {
  test('path alias imports work correctly with split-exports', async ({
    page,
  }) => {
    await page.goto('/alias-import')
    await page.waitForLoadState('networkidle')

    // Check constants from aliased imports
    await expect(page.getByTestId('app-name')).toContainText(
      'Split Exports Test App',
    )
    await expect(page.getByTestId('greeting-prefix')).toContainText(
      'Welcome to Split Exports Test App',
    )
    // Check formatUserName (pure function re-exported from shared.ts)
    await expect(page.getByTestId('formatted-name')).toContainText('Jane Smith')

    // Check SSR results
    await expect(page.getByTestId('ssr-env')).toContainText('server')
    await expect(page.getByTestId('ssr-greeting')).toContainText(
      'Hello from the server',
    )
    await expect(page.getByTestId('ssr-user')).toContainText('User 100')
    // Check profile from nested module (tests internal server-only usage)
    await expect(page.getByTestId('ssr-profile')).toContainText('User 42')

    // Run client tests
    await page.getByTestId('run-client-tests-btn').click()
    await page.waitForLoadState('networkidle')

    // Check client results
    await expect(page.getByTestId('client-env')).toContainText('client')
    await expect(page.getByTestId('client-greeting')).toContainText(
      'Hello from the client',
    )
    await expect(page.getByTestId('server-env')).toContainText('server')
    await expect(page.getByTestId('server-greeting')).toContainText(
      'Hello from the server',
    )
    // Check server profile from nested module
    await expect(page.getByTestId('server-profile')).toContainText('User 99')
  })
})

test.describe('Server Request Import', () => {
  /**
   * This test verifies a critical bug fix in the split-exports plugin:
   *
   * When a route file is processed with `?tss-split-exports=Route`, imports
   * inside that file should ALSO be rewritten with the split-exports query.
   * Previously, the plugin would skip import rewriting for files that already
   * had the query, causing server-only imports to leak into the client bundle.
   *
   * The test scenario:
   * 1. server-request.ts exports createServerFn (isomorphic) and uses
   *    `import { getRequest } from '@tanstack/react-start/server'` internally
   * 2. getRequest is server-only and should NOT be in client bundle
   * 3. server-request-import.tsx imports only the createServerFn
   * 4. The import should be rewritten to only include the server function,
   *    eliminating the server-only getRequest import from the client
   */
  test('server function using internal getRequest works correctly', async ({
    page,
  }) => {
    await page.goto('/server-request-import')
    await page.waitForLoadState('networkidle')

    // Check SSR/loader results
    // Loaders use GET requests
    await expect(page.getByTestId('loader-method')).toContainText('GET')
    await expect(page.getByTestId('loader-executed-on')).toContainText('server')

    // Run client tests
    await page.getByTestId('run-client-tests-btn').click()
    await page.waitForLoadState('networkidle')

    // Check client results
    // Client-side calls also use GET requests (with payload in query params)
    await expect(page.getByTestId('client-method')).toContainText('GET')
    await expect(page.getByTestId('client-executed-on')).toContainText('server')
    await expect(page.getByTestId('echo-result')).toContainText(
      'Hello from client!',
    )
    await expect(page.getByTestId('echo-method')).toContainText('GET')
  })
})

test.describe('No server-only code leaks to client', () => {
  test('client bundle does not contain server-only code markers', async ({
    page,
  }) => {
    // Navigate to a page to load client bundles
    await page.goto('/direct-import')
    await page.waitForLoadState('networkidle')

    // Get all script sources
    const scripts = await page.evaluate(() => {
      const scriptElements = Array.from(
        document.querySelectorAll('script[src]'),
      )
      return scriptElements.map((s) => s.getAttribute('src')).filter(Boolean)
    })

    // For each script, fetch and check it doesn't contain server-only markers
    for (const scriptSrc of scripts) {
      if (!scriptSrc || scriptSrc.includes('node_modules')) continue

      const response = await page.request.get(scriptSrc)
      const content = await response.text()

      // These strings should NOT appear in client bundles
      expect(content).not.toContain('passwordHash')
      expect(content).not.toContain('super-secret-key-should-not-leak')
      expect(content).not.toContain('postgresql://localhost:5432')
      expect(content).not.toContain(
        'Database code should not run on the client',
      )
    }
  })

  test('server-request-import page does not leak getRequest import to client', async ({
    page,
  }) => {
    // This test verifies the bug fix for imports inside files with ?tss-split-exports
    // Navigate to the server-request-import page to load its client bundles
    await page.goto('/server-request-import')
    await page.waitForLoadState('networkidle')

    // Get all script sources
    const scripts = await page.evaluate(() => {
      const scriptElements = Array.from(
        document.querySelectorAll('script[src]'),
      )
      return scriptElements.map((s) => s.getAttribute('src')).filter(Boolean)
    })

    // For each script, fetch and check it doesn't contain server-only markers
    for (const scriptSrc of scripts) {
      if (!scriptSrc || scriptSrc.includes('node_modules')) continue

      const response = await page.request.get(scriptSrc)
      const content = await response.text()

      // These strings from server-request.ts should NOT appear in client bundles
      expect(content).not.toContain(
        'This string should not appear in client bundles',
      )
    }
  })
})
