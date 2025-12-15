import { expect, type Page } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Split Exports Plugin HMR Tests
 *
 * These tests verify that Hot Module Replacement works correctly with the
 * split-exports plugin. When a source file changes, the correct modules
 * should be invalidated and the page should update.
 *
 * NOTE: These tests run against the dev server, not a production build.
 * See playwright-hmr.config.ts for the configuration.
 *
 * Test scenarios:
 * 1. Modify shared utility file - all importers should update
 * 2. Modify isomorphic function - client should see change
 * 3. Modify server-only code - client should NOT be affected (key feature!)
 * 4. Add/remove exports - affected importers should update
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const UTILS_DIR = path.resolve(__dirname, '../src/utils')
const SHARED_FILE = path.join(UTILS_DIR, 'shared.ts')
const NESTED_FILE = path.join(UTILS_DIR, 'nested.ts')

// Store original file contents for restoration
let originalSharedContent: string
let originalNestedContent: string

test.beforeAll(async () => {
  // Save original file contents
  originalSharedContent = await fs.promises.readFile(SHARED_FILE, 'utf-8')
  originalNestedContent = await fs.promises.readFile(NESTED_FILE, 'utf-8')
})

test.afterAll(async () => {
  // Restore original file contents
  await fs.promises.writeFile(SHARED_FILE, originalSharedContent)
  await fs.promises.writeFile(NESTED_FILE, originalNestedContent)
})

test.afterEach(async () => {
  // Restore files after each test to ensure clean state
  await fs.promises.writeFile(SHARED_FILE, originalSharedContent)
  await fs.promises.writeFile(NESTED_FILE, originalNestedContent)
  // Small delay to ensure file system syncs
  await new Promise((r) => setTimeout(r, 100))
})

/**
 * Helper to wait for HMR update to complete.
 * Looks for the HMR status indicator or waits for network idle.
 */
async function waitForHmr(page: Page, timeout = 5000): Promise<void> {
  // Wait for any pending HMR connections
  await page.waitForLoadState('networkidle', { timeout })
  // Additional small delay for HMR processing
  await page.waitForTimeout(500)
}

/**
 * Helper to modify a file and wait for HMR.
 */
async function modifyFileAndWaitForHmr(
  page: Page,
  filePath: string,
  transform: (content: string) => string,
): Promise<void> {
  const content = await fs.promises.readFile(filePath, 'utf-8')
  const modified = transform(content)
  await fs.promises.writeFile(filePath, modified)
  await waitForHmr(page)
}

test.describe('HMR: Isomorphic function changes', () => {
  test('updating APP_NAME constant reflects in the UI', async ({ page }) => {
    await page.goto('/direct-import')
    await page.waitForLoadState('networkidle')

    // Verify initial value
    await expect(page.getByTestId('app-name')).toContainText(
      'Split Exports Test App',
    )

    // Modify the APP_NAME constant
    await modifyFileAndWaitForHmr(page, SHARED_FILE, (content) =>
      content.replace(
        "export const APP_NAME = 'Split Exports Test App'",
        "export const APP_NAME = 'HMR Updated App Name'",
      ),
    )

    // Verify the change is reflected
    await expect(page.getByTestId('app-name')).toContainText(
      'HMR Updated App Name',
    )
  })

  test('updating formatUserName function reflects in the UI', async ({
    page,
  }) => {
    await page.goto('/direct-import')
    await page.waitForLoadState('networkidle')

    // Verify initial value
    await expect(page.getByTestId('formatted-name')).toContainText('John Doe')

    // Modify the formatUserName function to add a prefix
    await modifyFileAndWaitForHmr(page, SHARED_FILE, (content) =>
      content.replace(
        'return `${firstName} ${lastName}`.trim()',
        'return `[HMR] ${firstName} ${lastName}`.trim()',
      ),
    )

    // Verify the change is reflected
    await expect(page.getByTestId('formatted-name')).toContainText('[HMR] John')
  })

  test('updating getEnvironment client implementation reflects after button click', async ({
    page,
  }) => {
    await page.goto('/direct-import')
    await page.waitForLoadState('networkidle')

    // First click to get initial client result
    await page.getByTestId('run-client-tests-btn').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('client-env')).toContainText('client')

    // Modify the client implementation
    await modifyFileAndWaitForHmr(page, SHARED_FILE, (content) =>
      content.replace(".client(() => 'client')", ".client(() => 'hmr-client')"),
    )

    // Click again and verify the updated behavior
    await page.getByTestId('run-client-tests-btn').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('client-env')).toContainText('hmr-client')
  })
})

test.describe('HMR: Server-only code changes (should NOT affect client)', () => {
  test('modifying server-only function does not break client', async ({
    page,
  }) => {
    await page.goto('/direct-import')
    await page.waitForLoadState('networkidle')

    // Verify initial state works
    await expect(page.getByTestId('app-name')).toContainText(
      'Split Exports Test App',
    )

    // Modify server-only code - this should NOT cause client errors
    await modifyFileAndWaitForHmr(page, SHARED_FILE, (content) =>
      content.replace(
        "passwordHash: 'secret-hash-should-not-leak'",
        "passwordHash: 'modified-secret-hash'",
      ),
    )

    // Client should still work - no errors, still shows content
    await expect(page.getByTestId('app-name')).toContainText(
      'Split Exports Test App',
    )

    // Client tests should still work
    await page.getByTestId('run-client-tests-btn').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('client-env')).toContainText('client')
  })

  test('modifying server-only config does not affect client imports', async ({
    page,
  }) => {
    await page.goto('/direct-import')
    await page.waitForLoadState('networkidle')

    // Initial state
    await expect(page.getByTestId('formatted-name')).toContainText('John Doe')

    // Modify server-only config
    await modifyFileAndWaitForHmr(page, SHARED_FILE, (content) =>
      content.replace(
        "databaseUrl: 'postgresql://localhost:5432/mydb'",
        "databaseUrl: 'postgresql://localhost:5432/modified'",
      ),
    )

    // Client functionality should still work perfectly
    await expect(page.getByTestId('formatted-name')).toContainText('John Doe')
    await page.getByTestId('run-client-tests-btn').click()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('client-message')).toContainText('[CLIENT]')
  })
})

test.describe('HMR: Multiple importers', () => {
  test('change in shared.ts updates importing pages', async ({ page }) => {
    await page.goto('/direct-import')
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('app-name')).toContainText(
      'Split Exports Test App',
    )

    await modifyFileAndWaitForHmr(page, SHARED_FILE, (content) =>
      content.replace(
        "export const APP_NAME = 'Split Exports Test App'",
        "export const APP_NAME = 'Multi-Import Test'",
      ),
    )

    await expect(page.getByTestId('app-name')).toContainText(
      'Multi-Import Test',
    )
  })
})

test.describe('HMR: Nested dependency changes', () => {
  test('change in nested.ts GREETING_PREFIX propagates to importers', async ({
    page,
  }) => {
    await page.goto('/alias-import')
    await page.waitForLoadState('networkidle')

    // Check initial greeting prefix (computed from APP_NAME)
    await expect(page.getByTestId('greeting-prefix')).toContainText(
      'Welcome to Split Exports Test App',
    )

    // Modify GREETING_PREFIX in nested.ts
    // Note: This is a computed value, so we need to modify how it's computed
    await modifyFileAndWaitForHmr(page, NESTED_FILE, (content) =>
      content.replace(
        "export const GREETING_PREFIX = 'Welcome to ' + APP_NAME",
        "export const GREETING_PREFIX = 'HMR Updated: ' + APP_NAME",
      ),
    )

    await expect(page.getByTestId('greeting-prefix')).toContainText(
      'HMR Updated: Split Exports Test App',
    )
  })

  test('change in shared.ts APP_NAME propagates through nested.ts to importers', async ({
    page,
  }) => {
    await page.goto('/alias-import')
    await page.waitForLoadState('networkidle')

    // Initial state uses APP_NAME from shared.ts
    await expect(page.getByTestId('greeting-prefix')).toContainText(
      'Welcome to Split Exports Test App',
    )

    // Modify APP_NAME in shared.ts - should propagate through nested.ts
    await modifyFileAndWaitForHmr(page, SHARED_FILE, (content) =>
      content.replace(
        "export const APP_NAME = 'Split Exports Test App'",
        "export const APP_NAME = 'Cascading HMR Test'",
      ),
    )

    // The GREETING_PREFIX in nested.ts depends on APP_NAME
    await expect(page.getByTestId('greeting-prefix')).toContainText(
      'Welcome to Cascading HMR Test',
    )
  })
})

// Note: Error recovery tests are skipped because the test fixture
// automatically fails on any console errors, and we can't easily bypass
// that for intentional error scenarios. The main HMR functionality
// is covered by the other tests.
