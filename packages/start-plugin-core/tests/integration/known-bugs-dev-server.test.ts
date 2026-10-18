/**
 * Known Start bugs that only show on a running dev server, after edits. Each
 * pin asserts correct behaviour for a bug on main and is marked .fails;
 * remove .fails when the bug is fixed. Each pin has a control test that runs
 * the same harness on a case that works.
 */
import path from 'node:path'
import { evaluateServed } from '@tanstack/compiler-test-utils/dev-server'
import { describe, expect, test } from 'vitest'
import { importProtectionPlugin } from '../../src/vite/import-protection-plugin/plugin'
import { runInRequestContext } from '../build-harness'
import {
  callServerFnById,
  servedStartRuntime,
  startDevServer,
  startServerEntryFiles,
} from '../dev-server'
import { isMock } from '../importProtection/mock-helpers'
import type { ImportProtectionPluginOptions } from '../../src/vite/import-protection-plugin/types'

const timeout = 30_000

/** A server-only module whose code marks the modules it ends up in. */
const dbModule = `export const db = { x: () => 'MARK_DB_SECRET' }\n`

/** Modules of the client environment that contain `marker`. */
function modulesContaining(modules: Record<string, string>, marker: string) {
  return Object.keys(modules).filter((url) => modules[url]!.includes(marker))
}

describe('editing a server fn factory', () => {
  /**
   * `src/a.tsx` defines a server fn with the `base` builder of `src/b.ts`,
   * imported from `importFrom` (`./b`, or `./c` and `./d`, which re-export it
   * with `export *` and with an import and an export); `src/b.ts` starts as
   * a plain object and becomes a `createServerFn()` builder.
   */
  async function editFactory(importFrom: string) {
    const server = await startDevServer({
      files: {
        'src/b.ts': `export const base = { handler: (fn: () => unknown) => fn }\n`,
        'src/c.ts': `export * from './b'\n`,
        'src/d.ts': `import { base } from './b'\nexport { base }\n`,
        'src/db.server.ts': dbModule,
        'src/a.tsx': `import { base } from '${importFrom}'
import { db } from './db.server'
export const fn = base.handler(async () => db.x())
`,
      },
    })
    // The page loads: `fn` is a plain function, its code runs in the browser
    expect(
      modulesContaining(await server.load('/src/a.tsx'), 'MARK_DB_SECRET'),
    ).toEqual(['/src/db.server.ts'])

    await server.edit({
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
    })
    return { server, client: await server.load('/src/a.tsx') }
  }

  // Control for the pin below (same harness): a module importing the factory
  // module directly is recompiled.
  test(
    'client: a module importing an edited factory module directly loads no server code',
    async () => {
      const { client } = await editFactory('./b')
      expect(modulesContaining(client, 'MARK_DB_SECRET')).toEqual([])
    },
    timeout,
  )

  // Control for the pin below (same harness): the compiler resolves the
  // factory through the re-export on a server that starts after the edit.
  test(
    'client: a module importing a factory module through a re-export loads no server code',
    async () => {
      const server = await startDevServer({
        files: {
          'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
          'src/c.ts': `export * from './b'\n`,
          'src/db.server.ts': dbModule,
          'src/a.tsx': `import { base } from './c'
import { db } from './db.server'
export const fn = base.handler(async () => db.x())
`,
        },
      })
      expect(
        modulesContaining(await server.load('/src/a.tsx'), 'MARK_DB_SECRET'),
      ).toEqual([])
    },
    timeout,
  )

  // Bug: on a factory module edit, the client environment of the Start
  // compiler's Vite plugin invalidates only the direct importers of the
  // module; the walk through transitive importers runs for server
  // environments only (vite/start-compiler-plugin/plugin.ts
  // `invalidateCompilerState`). Vite soft-invalidates the other importers and
  // serves their previous transform.
  // Impact: after a factory module (e.g. a `createServerFn()` builder) is
  // edited, a module two or more imports away keeps the code compiled
  // against the old factory until a restart: when the builder becomes a
  // server fn, its handler and server-only imports still load in the browser
  // (and when it stops being one, the client keeps an RPC stub).
  // Source: gap DV26 (gaps/dev-hmr.md).
  test.fails.each([
    { name: 'export *', from: './c' },
    { name: 'an import and an export', from: './d' },
  ])(
    'client: a module importing an edited factory module through a re-export ($name) loads no server code',
    async ({ from }) => {
      const { client } = await editFactory(from)
      expect(modulesContaining(client, 'MARK_DB_SECRET')).toEqual([])
    },
    timeout,
  )
})

describe('editing a server fn factory (SSR)', () => {
  /**
   * Like `editFactory` above, in the SSR environment: `src/a.tsx` runs in SSR
   * while `fn` is a plain function, then `src/b.ts` becomes a
   * `createServerFn()` builder. Returns what `fn` is in SSR afterwards: its
   * server fn id, what calling it returns, and what a page's call of that
   * id returns (`callServerFnById`: Start's server entry handles it).
   */
  async function editFactorySsr(importFrom: string) {
    const server = await startDevServer({
      start: {},
      files: {
        ...startServerEntryFiles,
        'src/b.ts': `export const base = { handler: (fn: () => unknown) => fn }\n`,
        'src/c.ts': `export * from './b'\n`,
        'src/d.ts': `import { base } from './b'\nexport { base }\n`,
        'src/db.server.ts': dbModule,
        'src/a.tsx': `import { base } from '${importFrom}'
import { db } from './db.server'
export const fn = base.handler(async () => db.x())
`,
      },
    })
    const before = (await server.import('/src/a.tsx')).fn
    expect(before.serverFnMeta).toBeUndefined()
    await server.edit({
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
    })
    const { fn } = await server.import('/src/a.tsx')
    const settle = async (run: () => unknown) => {
      try {
        return await run()
      } catch (error) {
        return `throws: ${(error as Error).message}`
      }
    }
    return {
      id: typeof fn.serverFnMeta?.id,
      called: await settle(() => runInRequestContext(() => fn())),
      byId: await settle(() => callServerFnById(server, fn.serverFnMeta?.id)),
    }
  }

  /** `fn` is a server fn in SSR: it has an id, and runs its handler both ways. */
  const serverFn = {
    id: 'string',
    called: 'MARK_DB_SECRET',
    byId: 'MARK_DB_SECRET',
  }

  // Control for the pin below (same harness).
  test(
    'SSR: a module importing an edited factory module directly gets a server fn',
    async () => {
      expect(await editFactorySsr('./b')).toEqual(serverFn)
    },
    timeout,
  )

  // Bug: same as the client pin above, in the SSR environment: on a factory
  // module edit, the server environments do walk the transitive importers
  // (`getTransitiveImporters`), but only invalidate the compiler's state and
  // the server-fn lookup modules of the importers it finds; Vite's module
  // nodes of the importers two or more imports away are only
  // soft-invalidated, and their previous transform is served.
  // Impact: after a factory module is edited into a server fn builder, an
  // SSR module importing it through a re-export keeps the code compiled
  // against the old factory until a restart: its `fn` is no server fn (no
  // id, so no HTTP endpoint, e.g. for a form action), and in the opposite
  // edit it keeps a server fn that no longer exists.
  // Source: N15 (replaces start-compiler-factories.test.ts "dev: modules
  // reaching a factory through imports and export * are its transitive
  // importers", which only checked the walk).
  test.fails.each([
    { name: 'export *', from: './c' },
    { name: 'an import and an export', from: './d' },
  ])(
    'SSR: a module importing an edited factory module through a re-export ($name) gets a server fn',
    async ({ from }) => {
      expect(await editFactorySsr(from)).toEqual(serverFn)
    },
    timeout,
  )
})

describe('import protection', () => {
  /**
   * Import protection with the default rules, in its dev (mock) mode, with
   * `router` (the module the test loads first) registered as the app's router
   * entry, like `tanStackStart()` registers `src/router.tsx`.
   */
  const importProtection =
    (router: string) =>
    ({ root }: { root: string }) => [
      importProtectionPlugin({
        getConfig: (() => ({
          startConfig: { importProtection: {} },
          resolvedStartConfig: {
            srcDirectory: path.join(root, 'src'),
            routerFilePath: path.join(root, router),
          },
        })) as unknown as ImportProtectionPluginOptions['getConfig'],
        framework: 'react',
        environments: [
          { name: 'client', type: 'client' },
          { name: 'ssr', type: 'server' },
        ],
        providerEnvName: 'ssr',
      }),
    ]

  /**
   * A client module with a server fn whose top-level code calls a function
   * imported from a module denied to the client.
   */
  const deniedCallFiles = (denied: string) => ({
    'src/a.ts': `import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '${denied}'
const request = getRequest()
export const fn = createServerFn().handler(async () => request)
`,
    'src/request.server.ts': `export const getRequest = () => ({ url: 'MARK_REQUEST_SECRET' })\n`,
  })

  /**
   * Loads `src/a.ts` in the client as the browser does: the URLs of the
   * served modules with the denied file's code, and the client's server fn
   * (dependencies loaded from the dev server too).
   */
  async function loadClient(
    server: Awaited<ReturnType<typeof startDevServer>>,
  ) {
    const modules = await server.load('/src/a.ts', { skip: /^\/@vite\b/ })
    const { fn } = await evaluateServed(server, '/src/a.ts', {
      skip: /^\/@vite\b/,
      stubs: servedStartRuntime,
    })
    return {
      secret: modulesContaining(modules, 'MARK_REQUEST_SECRET'),
      functionId: typeof fn.serverFnMeta?.id,
    }
  }

  // Control for the pin below (same harness): a denied file goes through the
  // file rule, which mocks the file itself.
  test(
    'client: a server fn module calling a function of a denied file at the top level loads, without the denied code',
    async () => {
      const server = await startDevServer({
        files: deniedCallFiles('./request.server'),
        plugins: importProtection('src/a.ts'),
      })
      expect(await loadClient(server)).toEqual({
        secret: [],
        functionId: 'string',
      })
    },
    timeout,
  )

  // Bug: when the Start compiler resolves an import of the module it is
  // compiling (here the callee of a top-level call next to a server fn), import
  // protection handles a denied specifier before the module's transform
  // result exists, and falls back to `getModuleInfo(importer).code`, which
  // Vite's dev server does not support: reading it throws
  // (vite/import-protection-plugin/plugin.ts `resolveExportsForDeniedSpecifier`).
  // Impact: in dev, the client transform of such a module fails (500), so the
  // client entry never loads and the page does not hydrate.
  // Source: issue #8554 (closed without a fix), gap DV38 (gaps/dev-hmr.md).
  test.fails(
    'client: a server fn module calling a function of a denied specifier at the top level loads',
    async () => {
      const server = await startDevServer({
        files: deniedCallFiles('@tanstack/react-start/server'),
        plugins: importProtection('src/a.ts'),
      })
      expect(await loadClient(server)).toEqual({
        secret: [],
        functionId: 'string',
      })
    },
    timeout,
  )

  /**
   * `src/a.ts` imports `src/b.ts`, which starts with a server-only marker:
   * the client loads `src/b.ts` and then `src/a.ts` (which gets a mock of
   * it), then the marker is removed, with `edits`. Returns the client modules
   * `src/a.ts` loads afterwards.
   */
  async function removeMarker(edits: Record<string, string> = {}) {
    const server = await startDevServer({
      files: {
        'src/b.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_B_CODE'
`,
        'src/a.ts': `import { secret } from './b'
export const read = () => secret()
`,
      },
      plugins: importProtection('src/a.ts'),
    })
    await server.load('/src/b.ts')
    expect(
      modulesContaining(await server.load('/src/a.ts'), 'MARK_B_CODE'),
    ).toEqual([])

    await server.edit({
      'src/b.ts': `export const secret = () => 'MARK_B_CODE'\n`,
      ...edits,
    })
    return server.load('/src/a.ts')
  }

  // Control for the pin below (same harness): an importer edited with the
  // module is resolved again.
  test(
    'client: an edited importer of a module whose server-only marker was removed loads the module',
    async () => {
      const client = await removeMarker({
        'src/a.ts': `import { secret } from './b'
export const read = () => secret() + '!'
`,
      })
      expect(modulesContaining(client, 'MARK_B_CODE')).toEqual(['/src/b.ts'])
    },
    timeout,
  )

  // Bug: import protection replaces a client import of a module it knows is
  // server-only-marked with a mock when it resolves the import. On an edit of
  // the marked module it only clears its own caches
  // (vite/import-protection-plugin `hotUpdate`); Vite soft-invalidates the
  // importers, which keep their transform, and so the import of the mock.
  // Impact: after removing a server-only marker from a module, the modules
  // that imported it keep a mock in dev until they are edited or the server
  // restarts: the client calls mocks and logs "Mocked import used in dev
  // client" errors.
  // Source: gap DV37 (gaps/dev-hmr.md).
  test.fails(
    'client: the importer of a module whose server-only marker was removed loads the module',
    async () => {
      const client = await removeMarker()
      expect(modulesContaining(client, 'MARK_B_CODE')).toEqual(['/src/b.ts'])
    },
    timeout,
  )

  /**
   * Starts a dev server with import protection on an app of `files` and a
   * denied file `src/request.server.ts`, and evaluates `src/c.ts` as the
   * browser loads it. Returns `src/c.ts`'s namespace, or the error loading it
   * throws, and the server logs.
   */
  async function evaluateClient(files: Record<string, string>) {
    const server = await startDevServer({
      files: {
        'src/request.server.ts': `export const getRequest = () => ({ url: '/' })\n`,
        ...files,
      },
      plugins: importProtection('src/c.ts'),
    })
    const module = await evaluateServed(server, '/src/c.ts').catch(
      (error: unknown) => error,
    )
    return { module, logs: server.logs }
  }

  const deniedModules = [
    {
      name: 'a denied file',
      denied: './request.server',
      client: `import { getRequest } from './request.server'
import * as server from './request.server'
export const values = [getRequest, server.getRequest]
`,
    },
    {
      name: 'a denied specifier',
      denied: '@tanstack/react-start/server',
      client: `import { getRequest, getRequestHeader as getHeader } from '@tanstack/react-start/server'
import * as server from '@tanstack/react-start/server'
export const values = [getRequest, getHeader, server.setCookie]
`,
    },
  ]

  // Control for the pin below (same harness): the names a client module
  // imports from a denied module are mocks.
  test.each(deniedModules)(
    'client: names imported from $name are mocks',
    async ({ client }) => {
      const { module } = await evaluateClient({ 'src/c.ts': client })
      const { values } = module as { values: Array<unknown> }
      expect(values.map(isMock)).toEqual(values.map(() => true))
    },
    timeout,
  )

  /** Log lines without the code frames of import-protection warnings. */
  const messages = (logs: Array<string>) =>
    logs.flatMap((log) =>
      log.split('\n').filter((line) => !/^\s*(>\s*)?\d*\s*\|/.test(line)),
    )

  // Bug: in dev, a client module's `export * from` a denied module re-exports
  // nothing: the mock edge of a denied specifier exports only the names its
  // importer uses, and `export *` uses none; a denied file's `export *` is
  // removed from the importer.
  // Impact: a client module importing a name that another module re-exports
  // with `export *` from a denied module fails to load (missing export), so
  // the page does not hydrate. The only warning is the usual "Import denied"
  // one, which does not say that the re-exported names are not mocked.
  // Source: gap IP12 (gaps/start-env.md); the rewrite of the same form
  // (Rsbuild) also only removes the `export *`
  // (importProtection/rewrite.test.ts).
  test.fails.each(deniedModules)(
    'client: a name re-exported with `export *` from $name is a mock, or the server warns about the `export *`',
    async ({ denied }) => {
      const { module, logs } = await evaluateClient({
        'src/b.ts': `export * from '${denied}'\n`,
        'src/c.ts': `import { getRequest } from './b'\nexport const v = getRequest\n`,
      })
      expect(
        isMock((module as Record<string, unknown>).v) ||
          messages(logs).some((line) => line.includes('export *')),
      ).toBe(true)
    },
    timeout,
  )
})
