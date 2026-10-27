/**
 * The Start compiler on a running Vite dev server with Start's whole public
 * Vite plugin (client and SSR environments, SSR as the server fn provider):
 * edits of server fn factories and handlers reach every environment without
 * a restart. Client code runs in a real browser page of the dev server
 * (`runViteClient`).
 */
import react from '@vitejs/plugin-react'
import { describe, expect, onTestFinished, test } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import { requestsOfPrelude } from '../build-harness'
import {
  callServerFn,
  inDevRequest,
  startDevServer,
  startRequestFiles,
} from '../dev-server'
import {
  runViteClient,
  startBrowserStartDevServer,
} from './importProtection/client-pages'
import { reactApp } from './hydrate-dev-edits'

/** Pre-bundled up front, as Vite does for an app that installed them (as hydrate-dev.test.ts). */
const reactOptimizeDeps = {
  include: [
    'react',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@tanstack/react-router',
    '@tanstack/react-router > @tanstack/router-core > seroval',
    '@tanstack/react-router > @tanstack/router-core > seroval-plugins/web',
  ],
}

const timeout = 30_000

const factory = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
const plain = `export const base = { handler: (fn: () => unknown) => fn }\n`

describe('Vite dev: editing a server fn factory', () => {
  // Mirrors rsbuild/dev-server.test.ts "every module importing a factory
  // from ./b that stops being one keeps its handler".
  test(
    'client: a module importing a factory that stops being one keeps its handler',
    async () => {
      // (`src/db.ts` is no denied file: what the client gets of it is the
      // compiler's doing, not import protection's mock)
      const server = await startBrowserStartDevServer({
        files: {
          'src/b.ts': factory,
          'src/db.ts': `export const db = { x: () => 'MARK_DB_SECRET' }\n`,
          'src/a.tsx': `import { base } from './b'
import { db } from './db'
export const fn = base.handler(async () => db.x())
`,
        },
      })
      /** Runs `script` in a real page that loaded `src/a.tsx` (`entry`). */
      const inClient = async (script: string) =>
        (await runViteClient(server, '/src/a.tsx', script)).result
      expect(
        containing(await server.load('/src/a.tsx'), 'MARK_DB_SECRET'),
      ).toEqual([])
      // A server fn: the client calls the server, at the server fn's URL
      // (its public `url`; the dev id is implementation-specific, J4.4)
      const rpc = (await inClient(`${requestsOfPrelude}
return {
  url: entry.fn.url,
  requests: await requestsOf(entry.fn),
}`)) as { url: string; requests: Array<unknown> }
      expect(rpc.url).toEqual(expect.any(String))
      expect(rpc.requests).toEqual([{ url: rpc.url, method: 'GET' }])

      await server.edit({ 'src/b.ts': plain })

      // A plain function now: the client runs it
      expect(await inClient(`return await entry.fn()`)).toBe('MARK_DB_SECRET')
    },
    timeout,
  )
})

describe('Vite dev: server fns by id', () => {
  // A dev server compiles modules on demand: the resolver must find server
  // fns of modules compiled after it first loaded.
  // Source: mutation testing.
  test(
    'SSR: a server fn of a module compiled after the resolver first loaded runs by id',
    async () => {
      const server = await startDevServer({
        start: {},
        files: {
          ...startRequestFiles,
          'src/first.ts': `import { createServerFn } from '@tanstack/react-start'
export const first = createServerFn().handler(() => 'MARK_FIRST')
`,
          'src/later.ts': `import { createServerFn } from '@tanstack/react-start'
export const later = createServerFn().handler(() => 'MARK_LATER')
`,
        },
      })
      /** Calls the server fn `name` of `url` the way a page does: by id. */
      const callById = async (url: string, name: string) => {
        const fn = (await server.import(url))[name]
        return callServerFn(server, fn)
      }
      expect(await callById('/src/first.ts', 'first')).toBe('MARK_FIRST')
      expect(await callById('/src/later.ts', 'later')).toBe('MARK_LATER')
    },
    timeout,
  )
})

describe('Vite dev: virtual modules of other plugins', () => {
  // Start's dev plugins load their own `\0` virtual modules; a virtual
  // module of a plugin placed after Start's must still load from its plugin.
  // Source: mutation testing.
  test(
    'a virtual module of a plugin placed after the Start compiler loads',
    async () => {
      const resolvedId = '\0virtual:user-thing'
      const server = await startDevServer({
        plugins: [
          {
            name: 'user-virtual-module',
            resolveId: (source) =>
              source === 'virtual:user-thing' ? resolvedId : undefined,
            load: (id) =>
              id === resolvedId
                ? `export const thing = 'MARK_USER_THING'\n`
                : undefined,
          },
        ],
        files: {
          'src/uses-thing.ts': `export { thing } from 'virtual:user-thing'\n`,
        },
      })
      expect((await server.import('/src/uses-thing.ts')).thing).toBe(
        'MARK_USER_THING',
      )
    },
    timeout,
  )
})

describe('Vite dev: editing a server fn handler', () => {
  // Source: replaces server-fn-resolver-module.test.ts "imports on every call
  // by default" and "keeps the imported module when memoizeModules is set",
  // and the HMR half of exports-and-directives.test.ts "dev providers export
  // the handler and accept HMR updates".
  test(
    'SSR: the server fn resolver runs the edited handler, without a restart',
    async () => {
      const server = await startDevServer({
        start: {},
        files: {
          ...startRequestFiles,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'before')
`,
        },
      })
      /**
       * Calls `greet` the way a page does: by the id its current caller
       * carries (an edit may give the server fn a new id, J4.4).
       */
      const call = async () => {
        const { greet } = await server.import('/src/fns.ts')
        return callServerFn(server, greet)
      }
      expect(await call()).toBe('before')

      await server.edit({
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'after')
`,
      })

      expect(await call()).toBe('after')
    },
    timeout,
  )

  // An edit of a module only handlers read must not reload the server (or
  // the page): the handler runs the new code. Which server state survives
  // is Vite's business.
  // Source: the HMR half of exports-and-directives.test.ts "dev providers
  // export the handler and accept HMR updates"; SPEC G10 (no full reload
  // where feasible, no server-state requirement).
  test(
    'SSR: an edit of a module only the handler reads does not fully reload, and the handler runs the new code',
    async () => {
      const server = await startDevServer({
        start: {},
        files: {
          ...startRequestFiles,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const greet = createServerFn().handler(() => db.x())
`,
          'src/db.server.ts': `export const db = { x: () => 'before' }\n`,
        },
      })
      const call = async () => {
        const { greet } = await server.import('/src/fns.ts')
        return callServerFn(server, greet)
      }
      expect(await call()).toBe('before')

      // What the server sent while it handled the edit (`edit()` settles on
      // the watcher's report and Vite's handling of it, not on a quiet
      // period). The server side has no page: a full reload of the server
      // is the `full-reload` payload Vite sends its environment's module
      // runner, so its absence is what J3.6 asks for (not a count of the
      // updates the edit takes).
      const messages = describeHmr(
        await server.edit({
          'src/db.server.ts': `export const db = { x: () => 'after' }\n`,
        }),
      )

      expect(await call()).toBe('after')
      expect(
        messages.filter((message) => message.includes('full-reload')),
      ).toEqual([])
    },
    timeout,
  )

  // A module both the server fn module and its handler read: an edit
  // reaches the module's own code and the handler alike (one instance).
  test(
    'SSR: an edit of a module the server fn module and its handler share reaches both, without a full reload',
    async () => {
      const state = (version: string) =>
        `export const label = 'MARK_STATE_${version}'\n`
      const server = await startDevServer({
        start: {},
        files: {
          ...startRequestFiles,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { label } from './state'
export const shown = label.toLowerCase()
export const greet = createServerFn().handler(() => [shown, label])
`,
          'src/state.ts': state('V1'),
        },
      })
      const call = async () => {
        const { greet } = await server.import('/src/fns.ts')
        return callServerFn(server, greet)
      }
      expect(await call()).toEqual(['mark_state_v1', 'MARK_STATE_V1'])

      const messages = describeHmr(
        await server.edit({ 'src/state.ts': state('V2') }),
      )

      expect(await call()).toEqual(['mark_state_v2', 'MARK_STATE_V2'])
      expect(
        messages.filter((message) => message.includes('full-reload')),
      ).toEqual([])
    },
    timeout,
  )
})

describe('Vite dev: when the modules of a server fn handler load', () => {
  // Like a production build (start-build-lazy-handlers.test.ts): the
  // modules only handlers import load on the first call, once, however
  // many first calls run at the same time (server code calling the fn
  // directly, pages calling it over HTTP) while they load.
  // Source: issue #6451 (concurrent first calls of a server fn whose
  // handler's imports load slowly).
  test(
    'SSR: the server-only module of a handler loads on the first call, once, for concurrent direct and HTTP calls',
    async () => {
      const marker = '__tssDevLazyHandlerLoads'
      const global = globalThis as Record<string, unknown>
      onTestFinished(() => {
        delete global[marker]
      })
      const server = await startDevServer({
        start: {},
        files: {
          ...startRequestFiles,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const greet = createServerFn().handler(async () => db.x())
`,
          'src/db.server.ts': `const g = globalThis as Record<string, unknown>
g.${marker} = ((g.${marker} as number | undefined) ?? 0) + 1
await new Promise((resolve) => setTimeout(resolve, 100))
export const db = { x: () => 'MARK_DB' }
`,
        },
      })
      const { greet } = await server.import('/src/fns.ts')
      const before = global[marker] ?? 0
      const results = await Promise.all([
        ...Array.from({ length: 10 }, () =>
          inDevRequest(server, () => greet()),
        ),
        ...Array.from({ length: 10 }, () => callServerFn(server, greet)),
      ])
      expect({
        before,
        results: [...new Set(results)],
        after: global[marker],
      }).toEqual({ before: 0, results: ['MARK_DB'], after: 1 })
    },
    timeout,
  )
})

describe('Vite dev: editing what a route module imports', () => {
  // Importers observe a module's exports and (import protection) its
  // environment marker, not which modules it imports: an edit of a route
  // module's imports updates that route alone. Before, the importers' plans
  // depended on the module's whole J6 target facts (its import list
  // included), so the route tree, the route module's importer, was
  // re-transformed with it, and as no HMR boundary accepts the route tree,
  // every page fully reloaded. Source: the compiler soak
  // (benchmarks/compiler-perf `--scenarios soak`); SPEC G10.
  test(
    'the page updates in place, without a full reload',
    async () => {
      const route = (
        from: string,
      ) => `import { createFileRoute } from '@tanstack/react-router'
import { label } from '${from}'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <p data-testid="label">{label}</p>
}
`
      const server = await startDevServer({
        start: {},
        browser: true,
        config: { optimizeDeps: reactOptimizeDeps },
        plugins: [react()],
        files: {
          ...reactApp,
          'src/a.ts': `export const label = 'from-a'\n`,
          'src/b.ts': `export const label = 'from-b'\n`,
          'src/routes/index.tsx': route('../a'),
        },
      })
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await server.idle()

      await server.edit({ 'src/routes/index.tsx': route('../b') })

      await browser.waitForText('from-b', { selector: '[data-testid=label]' })
      expect(browser.loads()).toBe(1)
      expect(
        describeHmr(
          server.hmr.filter(
            (message) =>
              message.environment === 'client' &&
              message.type === 'full-reload',
          ),
        ),
      ).toEqual([])
      expect(browser.errors).toEqual([])
    },
    timeout,
  )
})

/** URLs of the served modules (or bundle chunks) that contain `marker`. */
function containing(modules: Record<string, string>, marker: string) {
  return Object.keys(modules).filter((url) => modules[url]!.includes(marker))
}

describe('Vite dev: editing a middleware', () => {
  /** A function middleware whose `.server()` puts `marker` in the context. */
  const middleware = (
    marker: string,
  ) => `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware({ type: 'function' })
  .client(({ next }) => next())
  .server(({ next }) => next({ context: { marker: '${marker}' } }))
`

  // With Start's whole Vite plugin (its environments and import
  // protection, not the compiler plugin alone). No other test edits a
  // createMiddleware in dev.
  test(
    'the client never gets the edited .server(), and SSR runs the new one',
    async () => {
      const server = await startDevServer({
        start: {},
        files: {
          ...startRequestFiles,
          'src/mw.ts': middleware('MARK_SERVER_V1'),
          // A server fn with the middleware: its handler reads what the
          // middleware's `.server()` put into the context of the call
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { mw } from './mw'
export const marker = createServerFn()
  .middleware([mw])
  .handler(async ({ context }) => context.marker)
`,
        },
      })
      /**
       * What `.server()` puts in the context on the server, for a call over
       * HTTP (Start's middleware chain runs it).
       */
      const ssrMarker = async () =>
        callServerFn(server, (await server.import('/src/fns.ts')).marker)
      expect(
        containing(await server.load('/src/mw.ts'), 'MARK_SERVER_V1'),
      ).toEqual([])
      expect(await ssrMarker()).toBe('MARK_SERVER_V1')

      await server.edit({ 'src/mw.ts': middleware('MARK_SERVER_V2') })

      expect(
        containing(await server.load('/src/mw.ts'), 'MARK_SERVER_V2'),
      ).toEqual([])
      expect(await ssrMarker()).toBe('MARK_SERVER_V2')
    },
    timeout,
  )
})

describe('Vite dev: editing an isomorphic fn', () => {
  const isomorphic = (
    version: string,
  ) => `import { createIsomorphicFn } from '@tanstack/react-start'
export const where = createIsomorphicFn()
  .server(() => 'MARK_SERVER_${version}')
  .client(() => 'MARK_CLIENT_${version}')
`

  // No other test edits an isomorphic fn in dev.
  test(
    'each environment runs its edited branch, and the client never gets the server one',
    async () => {
      const server = await startBrowserStartDevServer({
        files: { 'src/iso.ts': isomorphic('V1') },
      })
      /** What `where()` returns in each environment, and server code in the client. */
      const run = async (version: string) => ({
        client: (
          await runViteClient(server, '/src/iso.ts', 'return entry.where()')
        ).result,
        ssr: (await server.import('/src/iso.ts')).where(),
        serverCodeInClient: containing(
          await server.load('/src/iso.ts'),
          `MARK_SERVER_${version}`,
        ),
      })
      expect(await run('V1')).toEqual({
        client: 'MARK_CLIENT_V1',
        ssr: 'MARK_SERVER_V1',
        serverCodeInClient: [],
      })

      await server.edit({ 'src/iso.ts': isomorphic('V2') })

      expect(await run('V2')).toEqual({
        client: 'MARK_CLIENT_V2',
        ssr: 'MARK_SERVER_V2',
        serverCodeInClient: [],
      })
    },
    timeout,
  )
})

describe('Vite full-bundle dev (bundledDev)', () => {
  /**
   * `src/fns.ts` defines a server fn whose handler returns `MARK_HANDLER_*`
   * and a client-side label; the client bundle starts from `src/entry.ts`,
   * which exports both. `head` is added to `src/fns.ts`.
   */
  const fns = (
    version: string,
    head = '',
  ) => `${head}import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_HANDLER_${version}')
export const label = () => 'MARK_CLIENT_LABEL'
`
  const entry = `export { fn, label } from './fns'\n`
  /** Start's client entry, which the client bundle starts from, loads `src/entry.ts`. */
  const bundledClientEntry = {
    'harness/client-entry.ts': `export * from '../src/entry'\n`,
  }

  /** Calls `fn` the way a page does: by its id. */
  async function callById(server: Awaited<ReturnType<typeof startDevServer>>) {
    const { fn } = await server.import('/src/fns.ts')
    return callServerFn(server, fn)
  }

  test(
    'the client bundle has the client code and not the handler, and SSR runs the handler by id',
    async () => {
      const server = await startDevServer({
        start: {},
        plugins: [react()],
        bundledDev: { entry: 'src/entry.ts' },
        files: {
          ...startRequestFiles,
          ...bundledClientEntry,
          'src/fns.ts': fns('V1'),
          'src/entry.ts': entry,
        },
      })
      // The client code is there (in however many chunks), the handler not.
      const bundle = await server.clientBundle()
      expect(containing(bundle, 'MARK_CLIENT_LABEL')).not.toEqual([])
      expect(containing(bundle, 'MARK_HANDLER_V1')).toEqual([])
      expect(await callById(server)).toBe('MARK_HANDLER_V1')
    },
    timeout,
  )

  // In full-bundle dev, the client compiler loads the modules a top-level
  // call may come from through the bundler.
  // Source: issue #8407 ("cannot load the module info" of a server fn
  // module's dependency in bundledDev).
  test(
    'a server fn module with a top-level call of a dependency bundles for the client without its handler',
    async () => {
      const server = await startDevServer({
        plugins: [react()],
        bundledDev: { entry: 'src/entry.ts' },
        files: {
          ...bundledClientEntry,
          'src/fns.ts': fns(
            'V1',
            `import { z } from 'zod'\nexport const schema = z.object({})\n`,
          ),
          'src/entry.ts': entry,
        },
      })
      const bundle = await server.clientBundle()
      expect(containing(bundle, 'MARK_CLIENT_LABEL')).not.toEqual([])
      expect(containing(bundle, 'MARK_HANDLER_V1')).toEqual([])
      expect(server.logs.filter((log) => log.startsWith('error:'))).toEqual([])
    },
    timeout,
  )

  // Source: issue #7535 (SSR does not reflect edits in bundledDev).
  test(
    'SSR runs an edited handler, called directly and by id',
    async () => {
      const server = await startDevServer({
        start: {},
        plugins: [react()],
        bundledDev: { entry: 'src/entry.ts' },
        files: {
          ...startRequestFiles,
          ...bundledClientEntry,
          'src/fns.ts': fns('V1'),
          'src/entry.ts': entry,
        },
      })
      expect(await callById(server)).toBe('MARK_HANDLER_V1')

      await server.edit({ 'src/fns.ts': fns('V2') })

      const { fn } = await server.import('/src/fns.ts')
      expect({
        called: await inDevRequest(server, () => fn()),
        byId: await callById(server),
      }).toEqual({
        called: 'MARK_HANDLER_V2',
        byId: 'MARK_HANDLER_V2',
      })
    },
    timeout,
  )

  /**
   * Serves `src/a.tsx`, which calls `.handler()` on `base` from `src/b.ts`
   * (a plain object at first) with a handler reading the module `src/db.ts`
   * (no denied file: what the client gets of it is the compiler's doing),
   * and edits `src/b.ts` so that `base` becomes a server fn builder.
   */
  async function editFactoryIntoBuilder() {
    const server = await startDevServer({
      plugins: [react()],
      bundledDev: { entry: 'src/a.tsx' },
      files: {
        // Start's client entry, which the client bundle starts from
        'harness/client-entry.ts': `export * from '../src/a'\n`,
        'src/b.ts': plain,
        'src/db.ts': `export const db = { x: () => 'MARK_DB_SECRET' }\n`,
        'src/a.tsx': `import { base } from './b'
import { db } from './db'
export const fn = base.handler(async () => db.x())
`,
      },
    })
    expect(
      containing(await server.clientBundle(), 'MARK_DB_SECRET'),
    ).not.toEqual([])
    await server.edit({ 'src/b.ts': factory })
    return server
  }

  // Source: issue #8062 (a hook of the Start compiler plugin threw on an
  // edit in bundledDev; fix #8061 had no test).
  test(
    'a module whose factory becomes a server fn builder bundles again without errors',
    async () => {
      const server = await editFactoryIntoBuilder()
      await server.clientBundle()
      expect(server.logs.filter((log) => log.startsWith('error:'))).toEqual([])
    },
    timeout,
  )

  // Control: "Vite dev: editing a server fn factory" above (unbundled dev,
  // where the compiler invalidates the importers of an edited module).

  // Bug: in full-bundle dev, an edit of a module that turns what another
  // module imports into a server fn builder does not recompile the
  // importer: the dev engine re-bundles the edited module only, and the
  // Start compiler's bundledDev `watchChange` forgets the edited module
  // alone, so the importer keeps the output compiled against the old
  // `base`, handler and server-only imports included.
  // Source: packages/start-plugin-core/src/vite/start-compiler-plugin/plugin.ts:412-424
  // (client: `invalidateModule(id)` of the edited module only; the
  // unbundled path invalidates the importers, :318-358).
  // Impact: with `experimental.bundledDev`, the page keeps loading the
  // handler and the modules only it reads (server-only code) in the client
  // until the dev server restarts. Found with the real watchers
  // (the replaying harness forced a full rebuild, which hid it).
  test.fails(
    'a module whose factory becomes a server fn builder: the client bundle drops the handler',
    async () => {
      const server = await editFactoryIntoBuilder()
      expect(containing(await server.clientBundle(), 'MARK_DB_SECRET')).toEqual(
        [],
      )
    },
    timeout,
  )
})
