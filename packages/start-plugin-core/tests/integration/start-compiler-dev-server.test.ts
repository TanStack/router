/**
 * The Start compiler on a running Vite dev server (client and SSR
 * environments, SSR as the server fn provider): edits of server fn factories
 * and handlers reach every environment without a restart.
 */
import react from '@vitejs/plugin-react'
import { describe, expect, test } from 'vitest'
import {
  describeHmr,
  evaluateServed,
} from '@tanstack/compiler-test-utils/dev-server'
import { requestsOf, runInRequestContext } from '../build-harness'
import {
  callServerFnById,
  servedStartRuntime,
  startDevServer,
  startServerEntryFiles,
} from '../dev-server'

const timeout = 30_000

const factory = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
const plain = `export const base = { handler: (fn: () => unknown) => fn }\n`

describe('Vite dev: editing a server fn factory', () => {
  // Mirrors rsbuild/dev-server.test.ts "every module importing a factory
  // from ./b that stops being one keeps its handler" (N17).
  test(
    'client: a module importing a factory that stops being one keeps its handler',
    async () => {
      const server = await startDevServer({
        files: {
          'src/b.ts': factory,
          'src/db.server.ts': `export const db = { x: () => 'MARK_DB_SECRET' }\n`,
          'src/a.tsx': `import { base } from './b'
import { db } from './db.server'
export const fn = base.handler(async () => db.x())
`,
        },
      })
      /** The client's `fn` (dependencies loaded from the dev server too). */
      const clientFn = async () =>
        (
          await evaluateServed(server, '/src/a.tsx', {
            skip: /^\/@vite\b/,
            stubs: servedStartRuntime,
          })
        ).fn as () => Promise<unknown>
      expect(
        containing(await server.load('/src/a.tsx'), 'MARK_DB_SECRET'),
      ).toEqual([])
      // A server fn: the client calls the server, at the server fn's URL
      const rpc = (await clientFn()) as unknown as {
        url: string
        serverFnMeta: { id: string }
      } & (() => Promise<unknown>)
      expect(rpc.url.endsWith(rpc.serverFnMeta.id)).toBe(true)
      expect(await requestsOf(rpc)).toEqual([{ url: rpc.url, method: 'GET' }])

      await server.edit({ 'src/b.ts': plain })

      // A plain function now: the client runs it
      expect(await (await clientFn())()).toBe('MARK_DB_SECRET')
    },
    timeout,
  )
})

describe('Vite dev: server fns by id', () => {
  // A dev server compiles modules on demand: the resolver must find server
  // fns of modules compiled after it first loaded.
  // Source: mutation round 3 sc-hosts 3.
  test(
    'SSR: a server fn of a module compiled after the resolver first loaded runs by id',
    async () => {
      const server = await startDevServer({
        start: {},
        realRouter: true,
        files: {
          ...startServerEntryFiles,
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
        return callServerFnById(server, fn.serverFnMeta.id)
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
  // Source: mutation round 3 sc-hosts 10 (spc:5579).
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

describe('Vite dev: a server fn provider environment other than SSR', () => {
  // The RSC setup of a framework: the `rsc` environment runs the handlers,
  // and SSR forwards calls by id to it through the `getServerFnById` module
  // the framework configures.
  // Source: mutation round 3 sc-hosts 5.
  test(
    'SSR calls go through its configured getServerFnById, and the provider runs the handler of the client id',
    async () => {
      const server = await startDevServer({
        environments: [
          { name: 'client', type: 'client' },
          {
            name: 'ssr',
            type: 'server',
            getServerFnById: `export async function getServerFnById(id) {
  return () => 'MARK_FORWARDED:' + id
}
`,
          },
          { name: 'rsc', type: 'server' },
        ],
        providerEnvName: 'rsc',
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'MARK_HANDLER')
`,
        },
      })
      const id = (
        await evaluateServed(server, '/src/fns.ts', {
          skip: /^\/@vite\b/,
          stubs: servedStartRuntime,
        })
      ).greet.serverFnMeta.id
      /** The resolver of `environment`. */
      const resolver = async (environment: string) =>
        (await server.import('#tanstack-start-server-fn-resolver', environment))
          .getServerFnById
      // SSR's resolver is the test's module, which answers by itself.
      const forwarded = await (await resolver('ssr'))(id, { origin: 'client' })
      // The provider's resolver gives the server fn of the client id. (No
      // HTTP call: the server entry that handles one in such a setup is the
      // framework's, which this compiler-only setup has none of.)
      const provided = await (await resolver('rsc'))(id, { origin: 'client' })
      expect({
        ssr: forwarded(),
        rsc: await runInRequestContext(() => provided({})),
      }).toEqual({
        ssr: `MARK_FORWARDED:${id}`,
        rsc: expect.objectContaining({ result: 'MARK_HANDLER' }),
      })
    },
    timeout,
  )
})

describe('Vite dev: editing a server fn handler', () => {
  // Source: replaces server-fn-resolver-module.test.ts "imports on every call
  // by default" and "keeps the imported module when memoizeModules is set",
  // and the HMR half of exports-and-directives.test.ts "dev providers export
  // the handler and accept HMR updates" (N16; gap DV24).
  test(
    'SSR: the server fn resolver runs the edited handler under the same id, without a restart',
    async () => {
      const server = await startDevServer({
        start: {},
        realRouter: true,
        files: {
          ...startServerEntryFiles,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'before')
`,
        },
      })
      /** Calls `greet` the way a page does: by id. */
      const call = async () => {
        const { greet } = await server.import('/src/fns.ts')
        const id = greet.serverFnMeta.id
        return { id, result: await callServerFnById(server, id) }
      }
      const before = await call()
      expect(before.result).toBe('before')

      await server.edit({
        'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'after')
`,
      })

      expect(await call()).toEqual({ id: before.id, result: 'after' })
    },
    timeout,
  )

  // An edit of a module only handlers read must not reload the server (or
  // the page): the handler runs the new code. Which server state survives
  // is Vite's business.
  // Source: the HMR half of exports-and-directives.test.ts "dev providers
  // export the handler and accept HMR updates" (N16); user ruling 2026-10-18
  // (no full reload where feasible, no server-state requirement).
  test(
    'SSR: an edit of a module only the handler reads does not fully reload, and the handler runs the new code',
    async () => {
      const server = await startDevServer({
        start: {},
        realRouter: true,
        files: {
          ...startServerEntryFiles,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const greet = createServerFn().handler(() => db.x())
`,
          'src/db.server.ts': `export const db = { x: () => 'before' }\n`,
        },
      })
      const call = async () => {
        const { greet } = await server.import('/src/fns.ts')
        return callServerFnById(server, greet.serverFnMeta.id)
      }
      expect(await call()).toBe('before')

      const messages = describeHmr(
        await server.edit({
          'src/db.server.ts': `export const db = { x: () => 'after' }\n`,
        }),
      )

      expect(
        messages.filter((message) => message.includes('full-reload')),
      ).toEqual([])
      expect(await call()).toBe('after')
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
  // protection, not the compiler plugin alone).
  // Source: oracle-gaps H4 / DV31 (no dev edit of createMiddleware).
  test(
    'the client never gets the edited .server(), and SSR runs the new one',
    async () => {
      const server = await startDevServer({
        start: {},
        files: { 'src/mw.ts': middleware('MARK_SERVER_V1') },
      })
      /** What `.server()` puts in the context on the server. */
      const ssrMarker = async () =>
        (await server.import('/src/mw.ts')).mw.options.server({
          next: (options: unknown) => options,
        }).context.marker
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

  // Source: oracle-gaps H4 / DV32 (an isomorphic fn edit is never tested).
  test(
    'each environment runs its edited branch, and the client never gets the server one',
    async () => {
      const server = await startDevServer({
        files: { 'src/iso.ts': isomorphic('V1') },
      })
      /** What `where()` returns in each environment, and server code in the client. */
      const run = async (version: string) => ({
        client: (await evaluateServed(server, '/src/iso.ts')).where(),
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
    return callServerFnById(server, fn.serverFnMeta.id)
  }

  test(
    'the client bundle has the client code and not the handler, and SSR runs the handler by id',
    async () => {
      const server = await startDevServer({
        start: {},
        realRouter: true,
        plugins: [react()],
        bundledDev: { entry: 'src/entry.ts' },
        files: {
          ...startServerEntryFiles,
          ...bundledClientEntry,
          'src/fns.ts': fns('V1'),
          'src/entry.ts': entry,
        },
      })
      const bundle = await server.clientBundle()
      expect({
        client: containing(bundle, 'MARK_CLIENT_LABEL').length,
        handler: containing(bundle, 'MARK_HANDLER_V1'),
      }).toEqual({ client: 1, handler: [] })
      expect(await callById(server)).toBe('MARK_HANDLER_V1')
    },
    timeout,
  )

  // In full-bundle dev, the client compiler loads the modules a top-level
  // call may come from through the bundler.
  // Source: issue #8407 ("cannot load the module info" of a server fn
  // module's dependency in bundledDev), oracle-gaps H4 / DV29.
  test(
    'a server fn module with a top-level call of a dependency bundles for the client without its handler',
    async () => {
      const server = await startDevServer({
        bundledDev: { entry: 'src/entry.ts' },
        files: {
          'src/fns.ts': fns(
            'V1',
            `import { z } from 'zod'\nexport const schema = z.object({})\n`,
          ),
          'src/entry.ts': entry,
        },
      })
      expect(
        containing(await server.clientBundle(), 'MARK_HANDLER_V1'),
      ).toEqual([])
      expect(server.logs.filter((log) => log.startsWith('error:'))).toEqual([])
    },
    timeout,
  )

  // Source: issue #7535 (SSR does not reflect edits in bundledDev),
  // oracle-gaps H4 / DV29.
  test(
    'SSR runs an edited handler, called directly and by id',
    async () => {
      const server = await startDevServer({
        start: {},
        realRouter: true,
        plugins: [react()],
        bundledDev: { entry: 'src/entry.ts' },
        files: {
          ...startServerEntryFiles,
          ...bundledClientEntry,
          'src/fns.ts': fns('V1'),
          'src/entry.ts': entry,
        },
      })
      expect(await callById(server)).toBe('MARK_HANDLER_V1')

      await server.edit({ 'src/fns.ts': fns('V2') })

      const { fn } = await server.import('/src/fns.ts')
      expect({
        called: await runInRequestContext(() => fn()),
        byId: await callById(server),
      }).toEqual({
        called: 'MARK_HANDLER_V2',
        byId: 'MARK_HANDLER_V2',
      })
    },
    timeout,
  )

  // Source: issue #8062 (a hook of the Start compiler plugin threw on an
  // edit in bundledDev; fix #8061 had no test), oracle-gaps H4 / DV29.
  test(
    'a module whose factory becomes a server fn builder: the client bundle drops the handler, without errors',
    async () => {
      const server = await startDevServer({
        bundledDev: { entry: 'src/a.tsx' },
        files: {
          'src/b.ts': plain,
          'src/db.server.ts': `export const db = { x: () => 'MARK_DB_SECRET' }\n`,
          'src/a.tsx': `import { base } from './b'
import { db } from './db.server'
export const fn = base.handler(async () => db.x())
`,
        },
      })
      expect(
        containing(await server.clientBundle(), 'MARK_DB_SECRET'),
      ).toHaveLength(1)

      await server.edit({ 'src/b.ts': factory })

      expect(containing(await server.clientBundle(), 'MARK_DB_SECRET')).toEqual(
        [],
      )
      expect(server.logs.filter((log) => log.startsWith('error:'))).toEqual([])
    },
    timeout,
  )
})
