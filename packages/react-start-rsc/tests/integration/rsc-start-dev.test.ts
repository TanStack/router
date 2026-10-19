/**
 * Start with a separate server function provider (SPEC J4.2, J4.3, J4.16):
 * a React Start app with RSC enabled on a Vite dev server (`rsc-app.ts`),
 * where the `rsc` environment runs the handlers, SSR forwards its calls to
 * it, and a real page calls them from the browser. Outcomes only: what the
 * page shows, what a call by id answers, what the browser loaded. Edits
 * are in rsc-start-hmr.test.ts.
 */
import { describe, expect, test } from 'vitest'
import {
  openRscPage,
  settledValue,
  startRscDevServer,
  waitForHydration,
} from './rsc-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'

/**
 * A dependency whose entry differs by export condition: the environment a
 * handler runs in shows in what it imports.
 */
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
const page = (
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
async function callFromPage(browser: BrowserPage, expected: string) {
  await browser.page.locator('[data-testid=call]').click()
  await browser.waitForText(expected, { selector: '[data-testid=called]' })
}

describe('Vite dev: a separate RSC provider', () => {
  // J4.3, J4.16: SSR (the loader during the page render) and a client call
  // both run the handler in the provider, with its module-resolution
  // conditions (`react-server`), and the provider initialises the package
  // once; SSR's own code gets the `default` entry and the browser's the
  // `browser` entry, and no client script has another environment's entry.
  // Source: start S11, S18 (case 3), S40; V2-12 (c).
  test('each environment runs its own entry of a dependency; the provider runs the handler, whether SSR or the browser calls it', async () => {
    const server = await startRscDevServer({
      browser: true,
      config: {
        // Bundled into the provider like Start's own packages are
        // (`environments.rsc.resolve.noExternal`): in dev, Vite's module
        // runner imports an externalised dependency natively, with Node's
        // conditions, not the environment's.
        environments: { rsc: { resolve: { noExternal: ['env-marker'] } } },
        // The page imports it too: pre-bundled up front, as Vite does once
        // a page discovers it.
        optimizeDeps: { include: ['env-marker'] },
      },
      files: {
        ...envMarkerPackage,
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { where } from 'env-marker'
export const greet = createServerFn().handler(() => where())
`,
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { where } from 'env-marker'
import { greet } from '../fns'
export const Route = createFileRoute('/')({
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
      },
    })
    const browser = await openRscPage(server, '/')
    await browser.waitForText('ssr MARK_DEFAULT provider MARK_REACT_SERVER:1', {
      selector: '[data-testid=label]',
    })
    await waitForHydration(browser)
    await callFromPage(browser, 'called MARK_REACT_SERVER:1')
    await browser.page.locator('[data-testid=where]').click()
    await browser.waitForText('browser MARK_BROWSER', {
      selector: '[data-testid=browser]',
    })

    // What the browser loaded as code (not the server fn answers)
    const scripts = await browser.page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter(
          (entry) =>
            !['fetch', 'xmlhttprequest'].includes(
              (entry as PerformanceResourceTiming).initiatorType,
            ),
        )
        .map((entry) => new URL(entry.name).pathname),
    )
    const leaks: Array<string> = []
    for (const script of scripts) {
      const { body } = await server.fetch(script)
      if (/MARK_REACT_SERVER|MARK_DEFAULT/.test(body)) {
        leaks.push(script)
      }
    }
    // The check covers the dependency's browser entry
    expect(scripts.some((script) => script.includes('env-marker'))).toBe(true)
    expect(leaks).toEqual([])
    expect(browser.errors).toEqual([])
  })

  // J4.2 (user ruling D6): only server functions client code references are
  // callable over HTTP. `internal` is called by `greet`'s handler only
  // (server origin, allowed); a request by its id from the browser must be
  // refused.
  // Bug: a server-environment caller reports every server fn it compiles as
  // client-referenced (handleCreateServerFn.ts `isClientReferenced`), so the
  // resolver's client-origin check never refuses anything with a separate
  // provider.
  // Impact: a server fn only server code uses is callable by anyone who
  // learns its id.
  // Source: start S36; the compiler-level pin was in
  // start-plugin-core/tests/createServerFn/createServerFn.test.ts.
  test.fails(
    'a server function only server code calls is not callable from the browser',
    async () => {
      const server = await startRscDevServer({
        browser: true,
        files: {
          'src/internal.ts': `import { createServerFn } from '@tanstack/react-start'
export const internal = createServerFn().handler(() => 'MARK_INTERNAL')
`,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { internal } from './internal'
export const greet = createServerFn().handler(async () => 'MARK_GREET:' + (await internal()))
`,
          'src/routes/index.tsx':
            page(`import { createClientRpc } from '@tanstack/react-start/client-rpc'
if (typeof window !== 'undefined') {
  ;(window as any).callById = (id: string) => createClientRpc(id)({ method: 'GET' })
}
`),
        },
      })
      const browser = await openRscPage(server, '/')
      await browser.waitForText('label MARK_GREET:MARK_INTERNAL')
      await waitForHydration(browser)
      // The server-origin call works
      await callFromPage(browser, 'called MARK_GREET:MARK_INTERNAL')
      // The id the browser would need (not in the client: the SSR caller
      // knows it)
      const { internal } = await server.import('/src/internal.ts', 'ssr')
      const id = internal.serverFnMeta.id as string
      const outcome = await browser.page.evaluate(
        (functionId) =>
          (window as any).callById(functionId).then(
            (result: unknown) => ({ result }),
            (error: unknown) => ({ refused: String(error) }),
          ),
        id,
      )
      expect(outcome).not.toHaveProperty('result')
    },
  )

  // SPEC J4.2 / #7943: a server function declared in a `'use client'`
  // module runs on the server when the client calls it.
  // Bug: the provider module (`?tss-serverfn-split`) keeps the `'use client'`
  // directive of its source module, so the RSC bundler turns the provider's
  // exports into client references and the handler is not there to run.
  // Impact: a server fn co-located with a client component cannot be called.
  // Source: start S21 (compile-level pin in known-bugs-start-compiler.test.ts).
  test.fails(
    "a server function of a 'use client' module runs on the server",
    async () => {
      const server = await startRscDevServer({
        browser: true,
        files: {
          'src/widget.tsx': `'use client'
import { useState } from 'react'
import { createServerFn } from '@tanstack/react-start'
const getData = createServerFn().handler(() => 'MARK_WIDGET_DATA')
export function Widget() {
  const [data, setData] = useState('')
  return <button data-testid="widget" onClick={() => getData().then(setData)}>widget {data}</button>
}
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Widget } from '../widget'
export const Route = createFileRoute('/')({ component: () => <main><Widget /></main> })
`,
        },
      })
      const browser = await openRscPage(server, '/')
      await browser.waitForText('widget')
      await waitForHydration(browser)
      await browser.page.locator('[data-testid=widget]').click()
      // The answer, or what the page shows once its requests are done
      expect(
        await settledValue(
          browser,
          () => browser.text('[data-testid=widget]'),
          (text) => text.includes('MARK_WIDGET_DATA'),
        ),
      ).toBe('widget MARK_WIDGET_DATA')
    },
  )
})
