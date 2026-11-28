/**
 * Start on a running dev server, after edits, where main is wrong. Each
 * test asserts the correct behaviour for a bug main had, which today's
 * compiler fixes (a regression test, oracle/KNOWN-BUGS.md). Each has a
 * control test that runs the same harness on a case that works. The dev
 * servers run Start's whole public Vite plugin; client code runs in a real
 * browser page of the dev server (`runViteClient`).
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import {
  callServerFn,
  inDevRequest,
  startDevServer,
  startRequestFiles,
} from '../dev-server'
import { probeMockPrelude } from '../importProtection/mock-helpers'
import { starReexportApps } from '../importProtection/start-apps'
import {
  runViteClient,
  startBrowserStartDevServer,
} from './importProtection/client-pages'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'
import type { ImportProtectionOptions } from '../importProtection/start-apps'

/**
 * A module only a handler reads, whose code marks the modules it ends up in
 * (no denied file: what the client gets of it is the compiler's doing, not
 * import protection's mock).
 */
const dbModule = `export const db = { x: () => 'MARK_DB_SECRET' }\n`

/**
 * Runs `script` in a real page of `server` that loaded `entry` (as `entry`):
 * what it returns, or `throws: <message>` when loading or running fails.
 */
async function inClient(
  server: Pick<DevServer, 'url'>,
  entry: string,
  script: string,
): Promise<unknown> {
  return runViteClient(server, entry, script).then(
    ({ result }) => result,
    (error: Error) => `throws: ${error.message.split('\n')[0]}`,
  )
}

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
    const server = await startBrowserStartDevServer({
      files: {
        'src/b.ts': `export const base = { handler: (fn: () => unknown) => fn }\n`,
        'src/c.ts': `export * from './b'\n`,
        'src/d.ts': `import { base } from './b'\nexport { base }\n`,
        'src/db.ts': dbModule,
        'src/a.tsx': `import { base } from '${importFrom}'
import { db } from './db'
export const fn = base.handler(async () => db.x())
`,
      },
    })
    // The page loads: `fn` is a plain function, its code runs in the browser
    expect(
      await inClient(server, '/src/a.tsx', 'return await entry.fn()'),
    ).toBe('MARK_DB_SECRET')

    await server.edit({
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
    })
    return { server, client: await server.load('/src/a.tsx') }
  }

  // On main, after a factory module (e.g. a `createServerFn()` builder) is
  // edited, a module two or more imports away keeps the code compiled against
  // the old factory until a restart: when the builder becomes a server fn, its
  // handler and server-only imports still load in the browser (and when it
  // stops being one, the client keeps an RPC stub).
  test.each([
    { name: 'export *', from: './c' },
    { name: 'an import and an export', from: './d' },
  ])(
    'client: a module importing an edited factory module through a re-export ($name) loads no server code',
    async ({ from }) => {
      const { client } = await editFactory(from)
      expect(modulesContaining(client, 'MARK_DB_SECRET')).toEqual([])
    },
  )
})

describe('editing a server fn factory (SSR)', () => {
  /**
   * Like `editFactory` above, in the SSR environment: `src/a.tsx` runs in SSR
   * while `fn` is a plain function, then `src/b.ts` becomes a
   * `createServerFn()` builder. Returns what `fn` is in SSR afterwards: its
   * server fn URL (its id), what calling it returns, and what a page's
   * call of that id returns (`callServerFn`: Start's server entry handles
   * it).
   */
  async function editFactorySsr(importFrom: string) {
    const server = await startDevServer({
      files: {
        ...startRequestFiles,
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
    // (not a server fn: no server fn URL)
    expect(before.url).toBeUndefined()
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
      url: typeof fn.url,
      called: await settle(() => inDevRequest(server, () => fn())),
      byId: await settle(() => callServerFn(server, fn)),
    }
  }

  /**
   * `fn` is a server fn in SSR: it has a server fn URL (its id), and runs
   * its handler both ways.
   */
  const serverFn = {
    url: 'string',
    called: 'MARK_DB_SECRET',
    byId: 'MARK_DB_SECRET',
  }

  // On main, after a factory module is edited into a server fn builder, an SSR
  // module importing it through a re-export keeps the code compiled against the
  // old factory until a restart: its `fn` is no server fn (no id, so no HTTP
  // endpoint, e.g. for a form action), and in the opposite edit it keeps a
  // server fn that no longer exists.
  // Replaces the former start-compiler-factories.test.ts test "dev: modules
  // reaching a factory through imports and export * are its transitive
  // importers", which only checked the walk.
  test.each([
    { name: 'export *', from: './c' },
    { name: 'an import and an export', from: './d' },
  ])(
    'SSR: a module importing an edited factory module through a re-export ($name) gets a server fn',
    async ({ from }) => {
      expect(await editFactorySsr(from)).toEqual(serverFn)
    },
  )
})

describe('import protection', () => {
  /**
   * Start's options of an app with import protection's default rules, in
   * its dev (mock) mode, whose router entry (Start's public `router.entry`)
   * is `router` in `src` (the module the test loads first).
   */
  const importProtection = (router: string) => ({
    importProtection: {},
    router: { entry: router },
  })

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
   * Loads `src/a.ts` in the client: the served modules with the denied
   * file's code, and, in a real page, the type of the id the client's server
   * fn carries (or why the page could not load it).
   */
  async function loadClient(
    server: Awaited<ReturnType<typeof startDevServer>>,
  ) {
    const modules = await server.load('/src/a.ts', { skip: /^\/@vite\b/ })
    return {
      secret: modulesContaining(modules, 'MARK_REQUEST_SECRET'),
      functionId: await inClient(
        server,
        '/src/a.ts',
        'return typeof entry.fn.url',
      ),
    }
  }

  // Control for the pin below (same harness): a denied file goes through the
  // file rule, which mocks the file itself.
  test('client: a server fn module calling a function of a denied file at the top level loads, without the denied code', async () => {
    const server = await startBrowserStartDevServer({
      files: deniedCallFiles('./request.server'),
      start: importProtection('a.ts'),
    })
    expect(await loadClient(server)).toEqual({
      secret: [],
      functionId: 'string',
    })
  })

  // On main, in dev, the client transform of such a module fails (500), so the
  // client entry never loads and the page does not hydrate.
  // Source: issue #8554 (closed without a fix).
  test('client: a server fn module calling a function of a denied specifier at the top level loads', async () => {
    const server = await startBrowserStartDevServer({
      files: deniedCallFiles('@tanstack/react-start/server'),
      start: importProtection('a.ts'),
    })
    expect(await loadClient(server)).toEqual({
      secret: [],
      functionId: 'string',
    })
  })

  /**
   * `src/a.ts` imports `src/b.ts`, which starts with a server-only marker:
   * the client loads `src/b.ts` and then `src/a.ts` (which gets a mock of
   * it), then the marker is removed, with `edits`. Returns what `read()` of
   * `src/a.ts` gives in a real page afterwards: the module's value, or what
   * it is not.
   */
  async function removeMarker(edits: Record<string, string> = {}) {
    const server = await startBrowserStartDevServer({
      files: {
        'src/b.ts': `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_B_CODE'
`,
        'src/a.ts': `import { secret } from './b'
export const read = () => secret()
`,
      },
      start: importProtection('a.ts'),
    })
    await server.load('/src/b.ts')
    expect(
      modulesContaining(await server.load('/src/a.ts'), 'MARK_B_CODE'),
    ).toEqual([])

    await server.edit({
      'src/b.ts': `export const secret = () => 'MARK_B_CODE'\n`,
      ...edits,
    })
    return inClient(
      server,
      '/src/a.ts',
      `const value = entry.read()
return typeof value === 'string' ? value : 'not the module value (' + typeof value + ')'`,
    )
  }

  // On main, after removing a server-only marker from a module, the modules
  // that imported it keep a mock in dev until they are edited or the server
  // restarts: the client calls mocks and logs "Mocked import used in dev
  // client" errors.
  test('client: the importer of a module whose server-only marker was removed loads the module', async () => {
    expect(await removeMarker()).toBe('MARK_B_CODE')
  })

  /**
   * Starts a dev server with import protection on an app of `files` and a
   * denied file `src/request.server.ts` (more with `protection`), and runs
   * `script` in a real page that loaded `src/c.ts` (`entry`;
   * `probeMockPrelude` defines `isSafeMock`). Returns what the script
   * returns (or why the page could not load `src/c.ts`), and the server.
   */
  async function inClientOf(
    files: Record<string, string>,
    script: string,
    protection: ImportProtectionOptions = {},
  ) {
    const server = await startBrowserStartDevServer({
      files: {
        'src/request.server.ts': `export const getRequest = () => ({ url: '/' })\n`,
        ...files,
      },
      start: { ...importProtection('c.ts'), importProtection: protection },
    })
    return {
      result: await inClient(
        server,
        '/src/c.ts',
        `${probeMockPrelude}${script}`,
      ),
      server,
    }
  }

  // SPEC J6.8: in dev, a name a client module re-exports with `export *`
  // from a denied module is a safe mock, or the server warns at the `export *`
  // (`src/b.ts`, line 1); either way the importer loads, and nothing the
  // client gets holds the denied module's value.
  // On main, a client module importing a name that another module re-exports
  // with `export *` from a denied module fails to load (missing export), so the
  // page does not hydrate.
  // The rewrite of the same form (Rsbuild) also only removes the `export *`
  // (today's `rewriteDeniedImports`). (Both pass with the Yuku host: the mock
  // of a denied module exports the target's names, following `export *`; a
  // denied specifier's target is the package's own entry, also while the
  // dependency optimizer bundles it.)
  for (const app of starReexportApps) {
    test(`client: a name re-exported with \`export *\` from ${app.name} is a mock, or the server warns at the \`export *\``, async () => {
      const { files, importProtection: protection } = app
      const { result, server } = await inClientOf(
        files,
        `const secretIn = []
for (const { name } of performance.getEntriesByType('resource')) {
  if ((await (await fetch(name)).text()).includes('MARK_SECRET')) {
    secretIn.push(new URL(name).pathname)
  }
}
return { mock: isSafeMock(entry.v), secretIn }`,
        protection,
      )
      // The importer loads (or the reason it did not), and nothing the page
      // loaded holds the denied module's value
      const run = result as { mock: boolean; secretIn: Array<string> }
      expect(typeof result === 'string' ? result : run.secretIn).toEqual([])
      if (!run.mock) {
        expectDiagnostic(server.diagnostics, {
          file: 'src/b.ts',
          root: server.root,
          position: { line: 1 },
        })
      }
    })
  }
})
