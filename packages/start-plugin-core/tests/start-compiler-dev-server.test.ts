/**
 * The Start compiler on a running Vite dev server (client and SSR
 * environments, SSR as the server fn provider): edits of server fn factories
 * and handlers reach every environment without a restart.
 */
import { describe, expect, test } from 'vitest'
import {
  describeHmr,
  evaluateServed,
} from '@tanstack/compiler-test-utils/dev-server'
import { startDevServer } from './dev-server'

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
      expect(await server.transform('/src/a.tsx')).not.toContain('db.x()')

      await server.edit({ 'src/b.ts': plain })

      expect(await server.transform('/src/a.tsx')).toContain('db.x()')
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
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'before')
`,
        },
      })
      /** Calls `greet` the way the server-fn router does: by id. */
      const call = async () => {
        const { greet } = await server.import('/src/fns.ts')
        const { getServerFnById } = await server.import(
          '#tanstack-start-server-fn-resolver',
        )
        const handler = await getServerFnById(greet.functionId, {
          origin: 'client',
        })
        return { id: greet.functionId, result: await handler({}) }
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

  // The provider module accepts its own updates: an edit of a module only
  // handlers read stops there instead of reloading the server.
  // Source: the HMR half of exports-and-directives.test.ts "dev providers
  // export the handler and accept HMR updates" (N16).
  test(
    'SSR: an edit of a module only the handler reads is a hot update, and the handler runs the new code',
    async () => {
      const server = await startDevServer({
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const greet = createServerFn().handler(() => db.x())
`,
          'src/db.server.ts': `export const db = { x: () => 'before' }\n`,
        },
      })
      const call = async () => {
        const { greet } = await server.import('/src/fns.ts')
        const { getServerFnById } = await server.import(
          '#tanstack-start-server-fn-resolver',
        )
        const handler = await getServerFnById(greet.functionId, {
          origin: 'client',
        })
        return handler({})
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
      expect(
        messages.some((message) => message.startsWith('ssr: update')),
      ).toBe(true)
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

  // Source: oracle-gaps H4 / DV31 (no dev edit of createMiddleware).
  test(
    'the client never gets the edited .server(), and SSR runs the new one',
    async () => {
      const server = await startDevServer({
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

  /** Calls `fn` in SSR the way an HTTP call does: through the resolver, by its id. */
  async function callById(server: Awaited<ReturnType<typeof startDevServer>>) {
    const { fn } = await server.import('/src/fns.ts')
    const { getServerFnById } = await server.import(
      '#tanstack-start-server-fn-resolver',
    )
    return (await getServerFnById(fn.functionId, { origin: 'client' }))({})
  }

  test(
    'the client bundle has the client code and not the handler, and SSR runs the handler by id',
    async () => {
      const server = await startDevServer({
        bundledDev: { entry: 'src/entry.ts' },
        files: { 'src/fns.ts': fns('V1'), 'src/entry.ts': entry },
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
        bundledDev: { entry: 'src/entry.ts' },
        files: { 'src/fns.ts': fns('V1'), 'src/entry.ts': entry },
      })
      expect(await callById(server)).toBe('MARK_HANDLER_V1')

      await server.edit({ 'src/fns.ts': fns('V2') })

      const { fn } = await server.import('/src/fns.ts')
      expect({ called: await fn(), byId: await callById(server) }).toEqual({
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
