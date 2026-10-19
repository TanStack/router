/**
 * Start with RSC on Rsbuild (`rsc-app.ts`: Start's Rsbuild plugin, its RSC
 * layer and `react-server-dom-rspack`): which entry of a dependency each
 * environment runs (SPEC J4.3, J4.16, V2-12 (c)), and an edit of a route
 * module that declares the server function its loader and page call (SPEC
 * J3.6, V2-13). The Vite counterparts are rsc-start-dev.test.ts and
 * rsc-start-hmr.test.ts.
 *
 * Not here: a component edit keeping state (V2-13's other half) needs React
 * Refresh, which a React Start app on Rsbuild gets from
 * `@rsbuild/plugin-react`; this package cannot resolve it.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  openRscPage,
  startRscRsbuildDevServer,
  waitForHydration,
} from './rsc-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

/** A dependency whose entry differs by export condition. */
const envMarkerPackage = {
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
  // Counts its initialisations in the server process.
  'node_modules/env-marker/react-server.js': `globalThis.__envMarkerInits = (globalThis.__envMarkerInits ?? 0) + 1
export const where = () => 'MARK_REACT_SERVER:' + globalThis.__envMarkerInits
`,
  'node_modules/env-marker/browser.js': `export const where = () => 'MARK_BROWSER'\n`,
  'node_modules/env-marker/default.js': `export const where = () => 'MARK_DEFAULT'\n`,
}

/**
 * `/edit`: a server fn whose handler returns `MARK_HANDLER_*`, the loader
 * and the page calling it, and the page's label `MARK_LABEL_*`.
 */
const editRoute = (
  version: string,
) => `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
const greet = createServerFn().handler(async () => 'MARK_HANDLER_${version}')
export const Route = createFileRoute('/edit')({
  loader: () => greet(),
  component: Page,
})
function Page() {
  const label = Route.useLoaderData()
  const [called, setCalled] = useState('')
  return (
    <main>
      <p data-testid="label">MARK_LABEL_${version} {label}</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => greet().then(setCalled)}>call</button>
    </main>
  )
}
`

/** Clicks the page's call button and waits for the answer. */
async function callFromPage(page: BrowserPage, expected: string) {
  await page.page.locator('[data-testid=call]').click()
  await page.waitForText(expected, { selector: '[data-testid=called]' })
}

describe('Rsbuild dev with RSC', () => {
  let server: RsbuildDevServer
  const cleanups: Array<() => Promise<void>> = []

  beforeAll(async () => {
    server = await startRscRsbuildDevServer({
      browser: true,
      registerCleanup: (cleanup) => {
        cleanups.push(cleanup)
      },
      files: {
        ...envMarkerPackage,
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { where } from 'env-marker'
export const greet = createServerFn().handler(() => where())
`,
        'src/routes/env.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { where } from 'env-marker'
import { greet } from '../fns'
export const Route = createFileRoute('/env')({
  loader: async () => ({ own: where(), provider: await greet() }),
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  const [called, setCalled] = useState('')
  const [browser, setBrowser] = useState('')
  return (
    <main>
      <p data-testid="label">ssr {data.own} provider {data.provider}</p>
      <p data-testid="called">called {called}</p>
      <p data-testid="browser">browser {browser}</p>
      <button data-testid="call" onClick={() => greet().then(setCalled)}>call</button>
      <button data-testid="where" onClick={() => setBrowser(where())}>where</button>
    </main>
  )
}
`,
        'src/routes/edit.tsx': editRoute('V1'),
      },
    })
  })
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  // J4.3, J4.16: the provider runs the handler with `react-server` and
  // initialises the package once, whether SSR or the browser calls it; SSR's
  // own code gets `default`, the browser `browser`, and the client output
  // has no other environment's entry.
  // Source: V2-12 (c).
  test('each environment runs its own entry of a dependency; the provider runs the handler', async () => {
    expect(server.errors).toEqual([])
    const page = await openRscPage(server, '/env')
    await page.waitForText('ssr MARK_DEFAULT provider MARK_REACT_SERVER:1', {
      selector: '[data-testid=label]',
    })
    await waitForHydration(page)
    await callFromPage(page, 'called MARK_REACT_SERVER:1')
    await page.page.locator('[data-testid=where]').click()
    await page.waitForText('browser MARK_BROWSER', {
      selector: '[data-testid=browser]',
    })
    const client = Object.values(await server.outputs('client')).join('\n')
    expect({
      browser: client.includes('MARK_BROWSER'),
      server: /MARK_REACT_SERVER|MARK_DEFAULT/.test(client),
    }).toEqual({ browser: true, server: false })
    expect(page.errors).toEqual([])
  })

  // J3.6, V2-13 (#7618 as quoted) on Rsbuild's RSC layer: after an edit of
  // the handler of a route module's server fn, the page applies the hot
  // update (its loader runs the new handler) and the next call runs it,
  // without a full reload; the client's hot update never has the handler.
  test('a handler edit reaches the loader and the next call, without a full reload', async () => {
    const page = await openRscPage(server, '/edit')
    await page.waitForText('MARK_LABEL_V1 MARK_HANDLER_V1', {
      selector: '[data-testid=label]',
    })
    await waitForHydration(page)
    await callFromPage(page, 'called MARK_HANDLER_V1')

    await server.edit({ 'src/routes/edit.tsx': editRoute('V2') })
    expect(server.errors).toEqual([])
    await page.waitForText('MARK_HANDLER_V2', {
      selector: '[data-testid=label]',
    })
    await callFromPage(page, 'called MARK_HANDLER_V2')
    expect(page.loads()).toBe(1)
    const update = Object.values(await server.hotUpdates('client')).join('\n')
    expect({
      label: update.includes('MARK_LABEL_V2'),
      handler: update.includes('MARK_HANDLER_V2'),
    }).toEqual({ label: true, handler: false })
    expect(page.errors).toEqual([])
  })
})
