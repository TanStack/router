import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

/**
 * A dependency whose entry differs by export condition: the environment a
 * handler runs in shows in what it imports.
 */
export const envMarkerPackage = {
  'node_modules/env-marker/package.json': JSON.stringify({
    name: 'env-marker',
    type: 'module',
    exports: {
      '.': {
        'react-server': './react-server.js',
        browser: './browser.js',
        default: './default.js',
      },
    },
  }),
  // Counts its initialisations (all environments of a Vite dev server run
  // in the test process).
  'node_modules/env-marker/react-server.js': `globalThis.__envMarkerInits = (globalThis.__envMarkerInits ?? 0) + 1
export const where = () => 'MARK_REACT_SERVER:' + globalThis.__envMarkerInits
`,
  'node_modules/env-marker/browser.js': `export const where = () => 'MARK_BROWSER'\n`,
  'node_modules/env-marker/default.js': `export const where = () => 'MARK_DEFAULT'\n`,
}

/** Clicks the page's call button and waits for the answer. */
export async function callFromPage(browser: BrowserPage, expected: string) {
  await browser.page.locator('[data-testid=call]').click()
  await browser.waitForText(expected, { selector: '[data-testid=called]' })
}
