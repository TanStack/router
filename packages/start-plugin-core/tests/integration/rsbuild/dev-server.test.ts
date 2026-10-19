/**
 * The Start compiler on a running Rsbuild dev server: editing a factory
 * module rebuilds every client module compiled against it.
 */
import vm from 'node:vm'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import {
  runInClient,
  startRsbuildDevServer,
  startRsbuildStartDevServer,
  webGlobals,
} from '../../rsbuild-dev-server'
import { requestsOfPrelude } from '../../build-harness'

const timeout = 30_000

describe('Rsbuild dev: editing a server fn factory', () => {
  /**
   * `src/a1.ts` and `src/a2.ts` define server fns with the `base` builder of
   * `src/b.ts`, imported from `importFrom`; `src/b.ts` starts as a
   * `createServerFn()` builder and becomes a plain object, or the other way
   * around (`toFactory`). The dev server runs Start's whole Rsbuild plugin
   * (client and SSR environments, import protection).
   * Returns the client output afterwards, and what calling both fns in the
   * client gives (their results, or the error).
   */
  async function editFactory(importFrom: string, toFactory: boolean) {
    const factory = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
    const plain = `export const base = { handler: (fn: () => unknown) => fn }\n`
    const importer = (name: string) => `import { base } from '${importFrom}'
import { db } from './db'
export const ${name} = base.handler(async () => db.x())
`
    const server = await startRsbuildStartDevServer({
      files: {
        'src/b.ts': toFactory ? plain : factory,
        'src/c.ts': `export * from './b'\n`,
        // Not a `.server` file: import protection would mock it in the
        // client, which is not what this test is about.
        'src/db.ts': `export const db = { x: () => 'MARK_DB_SECRET' }\n`,
        'src/a1.ts': importer('fn1'),
        'src/a2.ts': importer('fn2'),
        'src/entry.ts': `import { fn1 } from './a1'
import { fn2 } from './a2'
;(globalThis as Record<string, unknown>).fns = [fn1, fn2]
`,
      },
    })
    const output = async () =>
      Object.values(await server.outputs('client')).join('\n')
    expect((await output()).includes('MARK_DB_SECRET')).toBe(toFactory)

    await server.edit({ 'src/b.ts': toFactory ? factory : plain })
    expect(server.errors).toEqual([])
    return {
      output: await output(),
      /** What calling both fns in the client returns. */
      called: await runInClient(
        server,
        `return await Promise.all(globalThis.fns.map((fn) => fn()))`,
      ),
      /** The URL of each fn, and the requests calling it sends. */
      requests: await runInClient(
        server,
        `${requestsOfPrelude}
const requests = []
for (const fn of globalThis.fns) {
  requests.push({ url: fn.url, sent: await requestsOf(fn) })
}
return requests`,
      ),
    }
  }

  // The compiler registers `src/b.ts` as a dependency (`addDependency`) only
  // of the module it first loads it for; the other importers depend on it in
  // Rspack because the compiler resolves the whole import chain from each
  // importer (the loader's `resolve()` records the files it resolves).
  // Source: gap DV27 (gaps/dev-hmr.md), suspected bug not reproduced.
  test.each(['./b', './c'])(
    'client: every module importing a factory from %s that becomes one loads no server code, and calls the server',
    async (importFrom) => {
      const { output, requests } = await editFactory(importFrom, true)
      expect(output).not.toContain('MARK_DB_SECRET')
      const url = expect.stringMatching(/^\/_serverFn\/./)
      const call = { url, sent: [{ url, method: 'GET' }] }
      expect(requests).toEqual({ result: [call, call] })
      const { result } = requests as {
        result: Array<{ url: string; sent: Array<{ url: string }> }>
      }
      expect(result.map(({ url, sent }) => sent[0]!.url === url)).toEqual([
        true,
        true,
      ])
    },
    timeout,
  )

  test.each(['./b', './c'])(
    'client: every module importing a factory from %s that stops being one keeps its handler',
    async (importFrom) => {
      expect((await editFactory(importFrom, false)).called).toEqual({
        result: ['MARK_DB_SECRET', 'MARK_DB_SECRET'],
      })
    },
    timeout,
  )
})

describe('Rsbuild dev with HMR: editing a server fn module', () => {
  /**
   * `src/routes/index.tsx` declares a server fn whose handler returns
   * `MARK_HANDLER_*`, a loader calling it, and a page showing the loader's
   * result, its label, the result of its last call from the browser and a
   * counter (its state).
   */
  const route = (
    version: string,
  ) => `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
const greet = createServerFn().handler(async () => 'MARK_HANDLER_${version}')
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
      <p data-testid="label">MARK_LABEL_${version} {label}</p>
      <p data-testid="called">called {called}</p>
      <button data-testid="call" onClick={() => greet().then(setCalled)}>call</button>
      <button data-testid="count" onClick={() => setCount(count + 1)}>count {count}</button>
    </main>
  )
}
`

  // A real page runs Start's Rsbuild dev server with its HMR client
  // (Rsbuild's default, `dev.hmr`): after an edit of a route module with a
  // server fn, the page applies the hot update (its loader runs the new
  // handler) and the next call from the page runs the new handler, without
  // a full reload; the client's hot update carries the edited client code
  // and never the handler. (What the edited component shows is route HMR's
  // business, router-plugin's page tests with React Refresh; this app has
  // no `@rsbuild/plugin-react`.)
  // Source: audit E2 missing coverage #4 (the Rsbuild hot-update path never
  // ran in tests); FIX-PLAN S12 (A13).
  test(
    'the page applies the hot update of an edited server fn module and the next call runs the edited handler, without a full reload',
    async () => {
      const server = await startRsbuildStartDevServer({
        hmr: true,
        browser: true,
        config: {
          tools: {
            // Start serves the pages, not an HTML template
            htmlPlugin: false,
            // React's JSX runtime, as `pluginReact()` of a React Start app
            // configures it
            swc: {
              jsc: {
                transform: {
                  react: { runtime: 'automatic', development: true },
                },
              },
            },
          },
        },
        files: {
          'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
          'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
          'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
          'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
          'src/routes/index.tsx': route('V1'),
        },
      })
      expect(server.errors).toEqual([])
      const page = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await page.waitForText('MARK_LABEL_V1 MARK_HANDLER_V1', {
        selector: '[data-testid=label]',
      })
      await page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
      await page.page.locator('[data-testid=count]').click()
      await page.waitForText('count 1', { selector: '[data-testid=count]' })
      await page.page.locator('[data-testid=call]').click()
      await page.waitForText('called MARK_HANDLER_V1', {
        selector: '[data-testid=called]',
      })

      await server.edit({ 'src/routes/index.tsx': route('V2') })
      expect(server.errors).toEqual([])
      await page.waitForText('MARK_HANDLER_V2', {
        selector: '[data-testid=label]',
      })
      await page.page.locator('[data-testid=call]').click()
      await page.waitForText('called MARK_HANDLER_V2', {
        selector: '[data-testid=called]',
      })
      expect(page.loads()).toBe(1)
      // The client's hot update has the client code and not the handler
      const update = Object.values(await server.hotUpdates('client')).join('\n')
      expect({
        label: update.includes('MARK_LABEL_V2'),
        handler: update.includes('MARK_HANDLER_V2'),
      }).toEqual({ label: true, handler: false })
      expect(page.errors).toEqual([])
    },
    timeout,
  )
})

describe('Rsbuild dev: removing a server fn module', () => {
  // The generated server fn resolver lists every server fn by id; a module
  // the app no longer has must leave it, or the next compile of the server
  // never completes.
  // Source: mutation round 3 sc-hosts 10 (spc:6802), with Start's whole
  // Rsbuild plugin.
  test(
    'deleting a module with a server fn keeps the dev server compiling',
    async () => {
      const fn = (
        name: string,
      ) => `import { createServerFn } from '@tanstack/react-start'
export const ${name} = createServerFn().handler(async () => 'MARK_${name}')
`
      const server = await startRsbuildStartDevServer({
        compileTimeout: 10_000,
        files: {
          'src/a.ts': fn('a'),
          'src/b.ts': fn('b'),
          'src/entry.ts': `export { a } from './a'\nexport { b } from './b'\n`,
        },
      })
      await server.edit({
        'src/b.ts': null,
        'src/entry.ts': `export { a } from './a'\n`,
      })
      expect(server.errors).toEqual([])
      const ssr = Object.values(await server.outputs('ssr')).join('\n')
      expect(ssr).toContain('MARK_a')
    },
    timeout,
  )
})

describe('Rsbuild dev: server fn ids', () => {
  // Server fns are called by id: two server fns sharing an id would run
  // each other's handler.
  // Source: mutation round 3 sc-hosts 2.
  test(
    'same-named server fns of two modules get different ids',
    async () => {
      const fn = `import { createServerFn } from '@tanstack/react-start'
export const getData = createServerFn().handler(async () => 'x')
`
      const server = await startRsbuildDevServer({
        files: {
          'src/a.ts': fn,
          'src/b.ts': fn,
          'src/entry.ts': `import { getData as a } from './a'
import { getData as b } from './b'
;(globalThis as Record<string, unknown>).ids = [a.serverFnMeta.id, b.serverFnMeta.id]
`,
        },
      })
      // The client bundle (one chunk) runs in a bare context
      const context = vm.createContext(webGlobals())
      context.self = context
      for (const code of Object.values(await server.outputs())) {
        vm.runInContext(code, context)
      }
      const ids = context.ids as Array<unknown>
      expect(ids).toEqual([expect.any(String), expect.any(String)])
      expect(ids[0]).not.toBe(ids[1])
    },
    timeout,
  )

  // (FIX-PLAN S35) Whether dev ids use `serverFns.generateFunctionId` is
  // free: it is a production-build contract (SPEC J4.4), covered by
  // start-build-options.test.ts "serverFns.generateFunctionId returning an
  // id"; dev caller/provider agreement by the page calls of "Rsbuild dev:
  // with HMR: editing a server fn module" above.
})
