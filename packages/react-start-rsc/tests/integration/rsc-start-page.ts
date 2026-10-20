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

/**
 * The page's text for `MARK_...` markers: `label` the loader's result, and
 * `called` what the last call from the browser returned.
 */
export const page = (
  fns: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { greet } from '../fns'
export const Route = createFileRoute('/')({
  loader: () => greet(),
  component: Page,
})
function Page() {
  const label = Route.useLoaderData()
  const [called, setCalled] = useState('')
  const [count, setCount] = useState(0)
  return (
    <main>
      <p data-testid="label">label {label}</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => greet().then(setCalled)}>call</button>
      <button data-testid="count" onClick={() => setCount(count + 1)}>count {count}</button>
    </main>
  )
}
${fns}`

/** Clicks the page's call button and waits for the answer. */
export async function callFromPage(browser: BrowserPage, expected: string) {
  await browser.page.locator('[data-testid=call]').click()
  await browser.waitForText(expected, { selector: '[data-testid=called]' })
}
