/**
 * Start with a separate server function provider (SPEC J4.2, J4.3, J3.6):
 * a React Start app with RSC enabled on a Vite dev server (`rsc-app.ts`),
 * where the `rsc` environment runs the handlers, SSR forwards its calls to
 * it, and a real page calls them from the browser. Outcomes only: what the
 * page shows, what a call by id answers, whether the page reloaded.
 */
import { describe, expect, test } from 'vitest'
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import { openRscPage, startRscDevServer, waitForHydration } from './rsc-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

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
  'node_modules/env-marker/react-server.js': `export const where = () => 'MARK_REACT_SERVER'\n`,
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

/** The HMR messages telling the client to reload the page. */
const fullReloads = (server: DevServer) =>
  describeHmr(
    server.hmr.filter(
      (message) =>
        message.environment === 'client' && message.type === 'full-reload',
    ),
  )

describe('Vite dev: a separate RSC provider', () => {
  // J4.3: SSR (the loader during the page render) and a client call both
  // run the handler in the provider, with its module-resolution conditions
  // (`react-server`), not SSR's or the browser's.
  // Source: start S11, S18 (case 3), S40; V2-12 (c).
  test('a handler runs in the provider environment, whether SSR or the browser calls it', async () => {
    const server = await startRscDevServer({
      browser: true,
      // Bundled into the provider like Start's own packages are
      // (`environments.rsc.resolve.noExternal`): in dev, Vite's module
      // runner imports an externalised dependency natively, with Node's
      // conditions, not the environment's.
      config: {
        environments: { rsc: { resolve: { noExternal: ['env-marker'] } } },
      },
      files: {
        ...envMarkerPackage,
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { where } from 'env-marker'
export const greet = createServerFn().handler(() => where())
`,
        'src/routes/index.tsx': page(''),
      },
    })
    const browser = await openRscPage(server, '/')
    await browser.waitForText('label MARK_REACT_SERVER')
    await waitForHydration(browser)
    await callFromPage(browser, 'called MARK_REACT_SERVER')
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
      await browser.waitForText('widget MARK_WIDGET_DATA', { timeout: 5_000 })
    },
  )
})

describe('Vite dev: edits with a separate RSC provider (SPEC J3.6)', () => {
  const route = (
    handler: string,
    text: string,
  ) => `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
const getLabel = createServerFn().handler(() => '${handler}')
export const Route = createFileRoute('/')({
  loader: () => getLabel(),
  component: Page,
})
function Page() {
  const label = Route.useLoaderData()
  const [called, setCalled] = useState('')
  const [count, setCount] = useState(0)
  return (
    <main>
      <p data-testid="text">${text} {label}</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => getLabel().then(setCalled)}>call</button>
      <button data-testid="count" onClick={() => setCount(count + 1)}>count {count}</button>
    </main>
  )
}
`

  // A route module that also declares a server function: editing the
  // handler makes the next call run the new code; editing the component
  // hot-updates the page, keeping its state; no full reload either way
  // (user ruling 2026-10-18).
  // Source: SPEC J3.6, V2-13 (#7618 as quoted), start S12 on Vite.
  test('a handler edit reaches the next call and a component edit hot-updates, without a full reload', async () => {
    const server = await startRscDevServer({
      browser: true,
      files: { 'src/routes/index.tsx': route('MARK_HANDLER_V1', 'Page v1') },
    })
    const browser = await openRscPage(server, '/')
    await browser.waitForText('Page v1 MARK_HANDLER_V1')
    await waitForHydration(browser)
    await browser.page.locator('[data-testid=count]').click()
    await browser.page.locator('[data-testid=count]').click()
    await browser.waitForText('count 2')
    await callFromPage(browser, 'called MARK_HANDLER_V1')

    // The handler
    await server.write({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v1'),
    })
    await callFromPage(browser, 'called MARK_HANDLER_V2')
    expect(fullReloads(server)).toEqual([])
    // The client's module of the route never has the handler (J4.12)
    expect(
      await server.transform('/src/routes/index.tsx', 'client'),
    ).not.toContain('MARK_HANDLER_V2')

    // The component
    await server.write({
      'src/routes/index.tsx': route('MARK_HANDLER_V2', 'Page v2'),
    })
    await browser.waitForText('Page v2', { selector: '[data-testid=text]' })
    expect(await browser.text('[data-testid=count]')).toBe('count 2')

    expect(browser.loads()).toBe(1)
    expect(fullReloads(server)).toEqual([])
    expect(browser.errors).toEqual([])
  })
})
