// Slow-tier half of this suite: the tests that need a real build. Its
// in-process tests are in ../known-bugs-start-compiler.test.ts (fast tier),
// its Vite dev server tests in known-bugs-start-compiler-dev.test.ts.
/**
 * Known Start compiler bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'
import {
  clientPage,
  runInClient,
  startRsbuildStartDevServer,
} from '../rsbuild-dev-server'
import { expectSourceError } from './source-errors'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/**
 * An installed CommonJS package (no `"type"`, so its `.js` file is a
 * script, as in old npm packages) with a top-level `return`, which only a
 * script may have, and the text `.handler(` but no Start API.
 */
const commonJsPackage = {
  'node_modules/legacy-lib/package.json': JSON.stringify({
    name: 'legacy-lib',
    version: '1.0.0',
    main: 'index.js',
  }),
  'node_modules/legacy-lib/index.js': `if (typeof module !== 'object') return
module.exports = function (app) {
  return app.handler(1)
}
`,
}

/** App code that calls the package and keeps what it returned. */
const commonJsImporter = `import legacy from 'legacy-lib'
export const result = legacy({ handler: (value: unknown) => ['handled', value] })
;(globalThis as any).legacyResult = result
`

describe.each(startBundlers)('%s build', (bundler) => {
  const timeout = 60_000

  /** A server-only module whose top-level code marks the bundle it is in. */
  const dbModule = `globalThis.MARK_DB_LOADED = true
export const db = { users: () => 'users' }
`

  // Control for the pin below (same harness).
  test(
    'client: the server-only module of a function only server code uses is not bundled',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: {
          'db.server.ts': dbModule,
          'fns.ts': `${head}import { db } from './db.server'
function find() { return db.users() }
export const fn = createServerFn().handler(async () => find())
`,
          'entry.ts': `export { fn } from './fns'\n`,
        },
      })
      expect(client.where('MARK_DB_LOADED')).toBe('nowhere')
    },
    timeout,
  )

  // Bug: the client output keeps a class only server code uses, with its
  // server-only import (compiler pin "client: a class used by a server fn
  // handler does not load its server-only import" in
  // ../known-bugs-start-compiler.test.ts). Tree-shaking drops the unused
  // class but keeps the import, so the server-only module's top-level code
  // is bundled and runs in the browser.
  // Impact: server-only modules (database clients, SDKs initialised with
  // secrets) ship to the client and run their top-level code there.
  // Source: gap D2 (gaps/dead-code.md), build canary.
  // One bundler (Vite): the compiler decides, as the import it leaves in
  // the client module loads the server-only module in any bundler; the
  // in-process pin above decides it, and this cell is its build canary.
  // (The Rsbuild cell was removed in the W3 speed pass.)
  if (bundler === 'vite') {
    test.fails(
      'client: the server-only module of a class only server code uses is not bundled',
      async () => {
        const { client } = await buildStart({
          bundler,
          files: {
            'db.server.ts': dbModule,
            'fns.ts': `${head}import { db } from './db.server'
class Repo { get() { return db.users() } }
export const fn = createServerFn().handler(async () => new Repo().get())
`,
            'entry.ts': `export { fn } from './fns'\n`,
          },
        })
        expect(client.where('MARK_DB_LOADED')).toBe('nowhere')
      },
      timeout,
    )
  }

  /** A server fn module whose `auth` import a type still mentions. */
  const typeofFiles = (verbatimModuleSyntax: boolean) => ({
    'tsconfig.json': JSON.stringify({
      compilerOptions: { verbatimModuleSyntax },
    }),
    'auth.ts': `globalThis.MARK_AUTH_LOADED = true
export const auth = { get: () => 'session', session: 'session' }
`,
    'fns.ts': `${head}import { auth } from './auth'
type Session = typeof auth.session
export const fn = createServerFn().handler(async () => auth.get() as Session)
`,
    'entry.ts': `export { fn } from './fns'\n`,
  })

  // Control for the pin below (same harness): without verbatimModuleSyntax,
  // TypeScript erases the import that only a type mentions.
  test(
    'client: a server-only module a type mentions is not bundled',
    async () => {
      const { client } = await buildStart({
        bundler,
        files: typeofFiles(false),
      })
      expect(client.where('MARK_AUTH_LOADED')).toBe('nowhere')
    },
    timeout,
  )

  // Bug (Vite): the client output keeps the server-only import that a
  // `typeof` type query still mentions (compiler pin "client: a server-only
  // import last mentioned by a type alias ..." above); with
  // `verbatimModuleSyntax`, Vite's TypeScript transform keeps it. Rsbuild's
  // transform of the same app drops it.
  // Impact: the server-only module's top-level code is bundled and runs in
  // the browser.
  // Source: gap D4 (gaps/dead-code.md), build canary.
  ;(bundler === 'vite' ? test.fails : test)(
    'client: a server-only module a type mentions is not bundled with verbatimModuleSyntax',
    async () => {
      const { client } = await buildStart({ bundler, files: typeofFiles(true) })
      expect(client.where('MARK_AUTH_LOADED')).toBe('nowhere')
    },
    timeout,
  )

  // Bug: with SSR as the server fn provider, the SSR caller module and the
  // provider module (`?tss-serverfn-split`) are two module instances of the
  // same file in the SSR bundle, and the provider repeats the file's
  // top-level code (exports-and-directives.test.ts "side-effect imports and
  // top-level statements stay in every output" asserts this).
  // Impact: in one server process, the file's top-level side effects run
  // twice, handlers and SSR code of the file see different module state, and
  // `instanceof` fails for a class of the file passed to a server fn.
  // Source: gap SF17 (gaps/start-env.md), PR #8656 (class identity).
  test.fails(
    'SSR: a server fn module is initialised once and shares its state with SSR code',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'fns.ts': `${head}globalThis.initialised = (globalThis.initialised ?? 0) + 1
let count = 0
export class Session {}
export const readCount = () => count
export const fn = createServerFn().handler(async ({ data }) => {
  count++
  return data instanceof Session
})
`,
          'entry.ts': `export { fn, readCount, Session } from './fns'\n`,
        },
      })
      const { result } =
        await ssr.run(`const isSession = await entry.fn({ data: new entry.Session() })
return { initialised: globalThis.initialised, isSession, count: entry.readCount() }`)
      expect(result).toEqual({ initialised: 1, isSession: true, count: 1 })
    },
    timeout,
  )

  /**
   * An app whose client imports one server fn (`clientFn`) and whose server
   * entry imports another one only server code uses (`serverOnlyFn`), and
   * Start's server entry, whose server-fn HTTP handler finds server fns by
   * id (`callByIdExports`). (Were `serverOnlyFn` missing from what the
   * server knows, issue #7213, the SSR call below would fail too: the pin
   * asserts it, so it cannot pass by a missing server fn.)
   */
  const clientAccessFiles = {
    'client-fns.ts': `${head}export const clientFn = createServerFn().handler(async () => 'client fn')
`,
    'server-only-fns.ts': `${head}export const serverOnlyFn = createServerFn().handler(async () => 'server-only fn')
`,
    'client-entry.ts': `export { clientFn } from './client-fns'
`,
    'ssr-entry.ts': `export { serverOnlyFn } from './server-only-fns'
${callByIdExports}`,
  }

  /**
   * Builds `clientAccessFiles` and, in the SSR build, sends a request for
   * each server fn id to Start's server entry, as a page does
   * (`callByIdPrelude`), and calls the server-only one from SSR code. One
   * build and run for the control and the pin below, which read the same
   * results (`clientAccess`).
   */
  async function buildAndCallClientAccess() {
    const { client, ssr } = await buildStart({
      bundler,
      files: clientAccessFiles,
      entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
    })
    // (the handler's text, however the bundle quotes it)
    expect(client.where('server-only fn')).toBe('nowhere')
    // (each server fn by its public URL: the server fn base, then its id;
    // `serverFnId` throws outside `settle` for a value without one, so the
    // pin cannot read a missing URL as a rejected call)
    const clientFnUrl = (await client.run(`return entry.clientFn.url`)).result
    const { result } =
      await ssr.run(`${callByIdPrelude}const settle = async (run) => {
  try {
    return await run()
  } catch {
    return 'rejected'
  }
}
const overHttp = (id) =>
  settle(async () => callById(id))
const clientFnId = serverFnId(${JSON.stringify(clientFnUrl)})
const serverOnlyFnId = serverFnId(entry.serverOnlyFn)
return {
  clientFn: await overHttp(clientFnId),
  serverOnlyFnOverHttp: await overHttp(serverOnlyFnId),
  serverOnlyFnFromSsr: await settle(() => entry.serverOnlyFn()),
}`)
    return result
  }
  let clientAccess: ReturnType<typeof buildAndCallClientAccess> | undefined
  const callClientAccess = () => (clientAccess ??= buildAndCallClientAccess())

  // Controls for the pin below (same harness).
  test(
    'SSR: a server fn the client references is callable over HTTP',
    async () => {
      expect(await callClientAccess()).toMatchObject({ clientFn: 'client fn' })
    },
    timeout,
  )
  // Not run on Vite: there, whether `serverOnlyFn` is in the production
  // resolver is the #7213 race (below): the SSR build reaches its module
  // and the resolver in parallel, and finds it first by about 12 ms on an
  // idle machine. The row after it asserts this call on both bundlers in an
  // order the app fixes, and the pin below asserts it too.
  if (bundler !== 'vite') {
    test(
      'SSR: a server fn only server code references is callable from SSR code',
      async () => {
        expect(await callClientAccess()).toMatchObject({
          serverOnlyFnFromSsr: 'server-only fn',
        })
      },
      timeout,
    )
  }
  // The app's server entry (Start's documented `server.entry`, here the
  // harness's) defines the server fn: the SSR build finds it when it
  // compiles that entry, before it reaches any module the entry imports,
  // Start's server fn resolver included, so on Vite too the order is fixed.
  // (SPEC J4.2: a server fn only server code calls works for those callers;
  // J4.6: a server fn declared at module top level works everywhere.)
  test(
    'SSR: a server fn the server entry defines and only server code references is callable from SSR code',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'entry.ts': `export {}\n`,
          'harness/server-entry.ts': `${head}export const serverOnlyFn = createServerFn().handler(async () => 'server-only fn')
;(globalThis as any).__tssBuildHarnessEntry = { serverOnlyFn }
export { default } from '@tanstack/react-start/server-entry'
`,
        },
      })
      const { result } = await ssr.run(`return await entry.serverOnlyFn()`)
      expect(result).toBe('server-only fn')
    },
    timeout,
  )

  // Bug: with SSR as the provider, the production resolver lists every
  // server fn the builds found and never checks the caller's origin
  // (`includeClientReferencedCheck` is off, and the flag it would check is
  // true for every SSR-caller compile, handleCreateServerFn.ts
  // `isClientReferenced`).
  // Impact: a server fn only server code uses (an SSR loader helper, a
  // server-only module) is callable over HTTP by anyone who learns its id,
  // bypassing what the server code around it checks.
  // Source: user ruling D6 (only server fns client code references are
  // HTTP-callable); the RSC-provider variant is pinned through a real RSC
  // provider in react-start-rsc tests/integration/rsc-start-dev.test.ts.
  // On Vite, when the SSR build loses the #7213 race (below), the server fn
  // is missing from the resolver: the call from SSR code fails too, so the
  // pin stays red (for #7213) and cannot pass by the missing server fn.
  test.fails(
    'SSR: a server fn only server code references is not callable over HTTP',
    async () => {
      expect(await callClientAccess()).toEqual({
        clientFn: 'client fn',
        serverOnlyFnOverHttp: 'rejected',
        serverOnlyFnFromSsr: 'server-only fn',
      })
    },
    timeout,
  )

  // Bug (Vite): the production server fn resolver is generated when the SSR
  // build first loads it, from the server fns found so far. A server fn that
  // only server code calls (another server fn's handler, a middleware
  // `.server()`) is found when the SSR build compiles the module that calls
  // it. When the SSR build reaches that module only through the resolver,
  // the server fn is found after the resolver was generated and is missing
  // from it. Only the resolver imports a server fn's handler (its provider
  // module) and, when only client code imports a server fn, everything that
  // server fn uses, its middleware included. Rsbuild rebuilds the resolver
  // after the SSR compilation found every server fn.
  // Impact: in production, calling it throws "Server function info not
  // found" (works in dev), from SSR code and over HTTP alike.
  // Source: issue #7213; SPEC J4.2 ("in any module processing order", G4).
  // When SSR code imports the server fn, or its caller, from another module,
  // the SSR build reaches the module that calls it and the resolver in
  // parallel: then whether it is in the resolver is a race (see the
  // controls above).
  // Not run on Vite: the middleware caller (the one #7213 quotes) when SSR
  // code imports the server fn that uses the middleware. The SSR build then
  // reaches the middleware's module and the resolver in parallel, and
  // whether it finds the server fn first is a race, which Vite usually wins
  // by a few milliseconds and loses under heavy load; no app input orders
  // the two. The rows where only client code imports that server fn pin
  // this caller deterministically.
  const innerFn = `${head}export const inner = createServerFn().handler(async () => 'inner')
`
  const calledByServerCode = {
    'another server fn': {
      'inner.ts': innerFn,
      'outer.ts': `${head}import { inner } from './inner'
export const outer = createServerFn().handler(async () => 'outer:' + (await inner()))
`,
    },
    'a middleware .server() of another module': {
      'inner.ts': innerFn,
      'auth.ts': `import { createMiddleware } from '@tanstack/react-start'
import { inner } from './inner'
export const auth = createMiddleware({ type: 'function' }).server(async ({ next }) =>
  next({ context: { inner: await inner() } }),
)
`,
      'outer.ts': `${head}import { auth } from './auth'
export const outer = createServerFn()
  .middleware([auth])
  .handler(async ({ context }) => 'outer:' + context.inner)
`,
    },
  }
  describe.each(Object.entries(calledByServerCode))(
    'SSR: a server fn that only %s calls',
    (caller, modules) => {
      const files = (order: 'as written' | 'reversed', ssrEntry: string) => {
        const entries = Object.entries({
          ...modules,
          'client-entry.ts': `export { outer } from './outer'\n`,
          'ssr-entry.ts': ssrEntry,
        })
        return Object.fromEntries(
          order === 'reversed' ? entries.reverse() : entries,
        )
      }

      if (bundler !== 'vite' || caller === 'another server fn') {
        ;(bundler === 'vite' ? test.fails : test).each([
          'as written',
          'reversed',
        ] as const)(
          'is callable, the app files written %s',
          async (order) => {
            const { ssr } = await buildStart({
              bundler,
              files: files(
                order,
                `export { outer } from './outer'\n${callByIdExports}`,
              ),
              entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
            })
            const { result } = await ssr.run(`${callByIdPrelude}return {
  fromSsr: await entry.outer(),
  overHttp: await callById(serverFnId(entry.outer)),
}`)
            expect(result).toEqual({
              fromSsr: 'outer:inner',
              overHttp: 'outer:inner',
            })
          },
          timeout,
        )
      }

      ;(bundler === 'vite' ? test.fails : test).each([
        'as written',
        'reversed',
      ] as const)(
        'its caller only client code imports: the caller is callable over HTTP, the app files written %s',
        async (order) => {
          const { client, ssr } = await buildStart({
            bundler,
            files: files(order, callByIdExports),
            entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
          })
          // (the caller by its public URL: the server fn base, then its id)
          const url = (await client.run(`return entry.outer.url`)).result
          const { result } = await ssr.run(
            `${callByIdPrelude}return await callById(serverFnId(${JSON.stringify(url)}))`,
          )
          expect(result).toBe('outer:inner')
        },
        timeout,
      )
    },
  )

  // Control: start-build-env-separation.test.ts "a library's server fn"
  // (a library exporting a top-level server fn).
  // Bug: a library in node_modules that creates server fns for its users
  // (`createLoggedServerFn(handler)` returning
  // `createServerFn().handler(handler)`) is compiled like any module, but
  // the user's module only calls the library's function, so the compiler
  // never sees a server fn there, and nothing warns.
  // Impact: the handler the user passes, and what it imports, ship to the
  // client bundle and run there instead of on the server.
  // Source: lost-cases-campaign item 13 (b); user ruling D13 (a server fn
  // created inside a function is supported, or rejected clearly).
  const wrapperLibrary = `import { createServerFn } from '@tanstack/react-start'
export function createLoggedServerFn(handler) {
  return createServerFn().handler(handler)
}
`
  const wrapperUser = `import { createLoggedServerFn } from 'wrapper-lib'
import { db } from './db'
export const fn = createLoggedServerFn(async () => db.secret())
`
  test.fails(
    'a server fn created by a library function: the handler is not in the client bundle, or the build fails clearly',
    async () => {
      const outcome = await buildStart({
        bundler,
        // The app depends on the library, as an installed one.
        packageJson: {
          name: 'app',
          private: true,
          type: 'module',
          dependencies: { 'wrapper-lib': '*' },
        },
        files: {
          'node_modules/wrapper-lib/package.json': JSON.stringify({
            name: 'wrapper-lib',
            type: 'module',
            exports: './index.js',
            peerDependencies: { '@tanstack/react-start': '*' },
          }),
          'node_modules/wrapper-lib/index.js': wrapperLibrary,
          'src/db.ts': `export const db = { secret: () => 'MARK_WRAPPED_HANDLER' }\n`,
          'src/fns.ts': wrapperUser,
          'src/entry.ts': `export { fn } from './fns'\n`,
        },
        entry: 'src/entry.ts',
      }).then(
        async ({ client, ssr }) => ({
          client: client.where('MARK_WRAPPED_HANDLER'),
          ssr: (await ssr.run(`return await entry.fn()`)).result,
        }),
        (error: unknown) => ({ error }),
      )
      if ('error' in outcome) {
        // A clear build error at the server fn: in the library, or at the
        // user's call of the library function (SPEC G5).
        expectSourceError(outcome.error, {
          names: ['createServerFn'],
          sites: [
            {
              file: 'node_modules/wrapper-lib/index.js',
              source: wrapperLibrary,
              at: 'createServerFn()',
            },
            {
              file: 'src/fns.ts',
              source: wrapperUser,
              at: 'createLoggedServerFn(async',
            },
          ],
        })
      } else {
        expect(outcome).toEqual({
          client: 'nowhere',
          ssr: 'MARK_WRAPPED_HANDLER',
        })
      }
    },
    timeout,
  )

  // Bug (Vite): Start's Vite plugin looks for the Start libraries it bundles
  // in SSR (`crawlFrameworkPkgs`: dependencies with a peer dependency on
  // Start) in the package.json of the working directory (`root:
  // process.cwd()`), not of Vite's root, which the plugin uses for its own
  // root a few lines above.
  // Source: src/vite/plugin.ts:143 (Vite's root: :96); found when the build
  // harness ran Start's real runtime (it ran Vite builds outside the app).
  // Impact: `vite build <app>` run from another directory (a monorepo root,
  // a script) leaves a Start library external in the SSR build: Node loads
  // it uncompiled, and an SSR call of its server fn returns undefined
  // instead of the handler's result.
  // Control: start-build-env-separation.test.ts "a library's server fn"
  // (the same library, built in the app's directory).
  ;(bundler === 'vite' ? test.fails : test)(
    "a build run from another directory: a library's server fn runs in the SSR build",
    async () => {
      const { ssr } = await buildStart({
        bundler,
        // The directory of this test file, whose package.json is not the
        // app's.
        cwd: __dirname,
        packageJson: {
          name: 'app',
          private: true,
          type: 'module',
          dependencies: { 'server-fn-lib': '*' },
        },
        files: {
          'node_modules/server-fn-lib/package.json': JSON.stringify({
            name: 'server-fn-lib',
            type: 'module',
            exports: './index.js',
            peerDependencies: { '@tanstack/react-start': '*' },
          }),
          'node_modules/server-fn-lib/index.js': `import { createServerFn } from '@tanstack/react-start'
export const libFn = createServerFn().handler(async () => 'MARK_LIB_HANDLER')
`,
          'src/entry.ts': `export { libFn } from 'server-fn-lib'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect((await ssr.run(`return await entry.libFn()`)).result).toBe(
        'MARK_LIB_HANDLER',
      )
    },
    timeout,
  )

  // Bug (Rsbuild): in the SSR build, compiling a module with an isomorphic
  // fn makes the Start compiler resolve the module's `createMiddleware`
  // import (the server lookup does not know that factory). The Rsbuild
  // compiler host resolves it through the loader context, whose resolver
  // does not match the package's `import`-only exports (those of
  // `@tanstack/react-start`): the build fails with
  // `PackagePathNotExported(".")` (start-compiler-host.ts `resolveId`).
  // Impact: an app with a middleware and an isomorphic fn in one module
  // does not build with Rsbuild.
  // Source: lost-cases item 3 (BS-6 / K-13).
  ;(bundler === 'rsbuild' ? test.fails : test)(
    'a module with a middleware and an isomorphic fn builds, and its middleware runs on the server',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/both.ts': `import { createIsomorphicFn, createMiddleware } from '@tanstack/react-start'
export const middleware = createMiddleware().server(({ next }) =>
  next({ context: { marker: 'MARK_MIDDLEWARE_SERVER' } }),
)
export const isomorphic = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
`,
          // The app's request middleware: a server fn's handler reads what
          // it put into the context of a request
          'src/start.ts': `import { createStart } from '@tanstack/react-start'
import { middleware } from './both'
export const startInstance = createStart(() => ({ requestMiddleware: [middleware] }))
`,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const marker = createServerFn().handler(
  async ({ context }) => (context as unknown as { marker?: string }).marker,
)
`,
          'src/entry.ts': `export { isomorphic } from './both'
export { marker } from './fns'
`,
          'src/ssr-entry.ts': `export * from './entry'
${callByIdExports}`,
        },
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect(client.where('MARK_MIDDLEWARE_SERVER')).toBe('nowhere')
      const { result } = await ssr.run(`${callByIdPrelude}return {
  middleware: await callById(serverFnId(entry.marker)),
  isomorphic: entry.isomorphic(),
}`)
      expect(result).toEqual({
        middleware: 'MARK_MIDDLEWARE_SERVER',
        isomorphic: 'server',
      })
    },
    timeout,
  )

  // Bug: the bundler plugins hand every module whose text matches a
  // detection pattern (here `.handler(`) to the Start compiler, which parses
  // it as an ES module and fails on a CommonJS script's top-level `return`.
  // The same package without that text builds and runs on both bundlers.
  // Impact: an app with such a dependency does not build (Vite: when client
  // code imports it, or SSR code with `noExternal`; Rsbuild: client or SSR).
  // Source: ruling Q7 (oracle RULINGS "CommonJS dependencies"), which
  // replaced the in-process compiler pin of this name with these apps.
  test.fails(
    'a CommonJS dependency with a top-level return builds and keeps its meaning',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: { ...commonJsPackage, 'entry.ts': commonJsImporter },
      })
      for (const output of [client, ssr]) {
        const { result } = await output.run('return entry.result')
        expect(result, output.env).toEqual(['handled', 1])
      }
    },
    timeout,
  )
})

describe('rsbuild dev', () => {
  // Bug: same as the build pin above; Rsbuild's dev server compiles the
  // same package without the `.handler(` text, and the page runs it.
  // Impact: the dev server fails to compile an app with such a dependency.
  // Source: as the build pin above.
  test.fails(
    'a CommonJS dependency with a top-level return compiles and keeps its meaning',
    async () => {
      const server = await startRsbuildStartDevServer({
        ...clientPage,
        files: { ...commonJsPackage, 'src/entry.ts': commonJsImporter },
      })
      expect(server.errors).toEqual([])
      expect(
        await runInClient(server, 'return globalThis.legacyResult'),
      ).toEqual({ result: ['handled', 1] })
    },
    60_000,
  )
})
