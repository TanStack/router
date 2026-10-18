// Slow-tier half of this suite: the tests that need a real tool. Its
// in-process tests are in ../known-bugs-start-compiler.test.ts (fast tier).
/**
 * Known Start compiler bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createServer, isRunnableDevEnvironment } from 'vite'
import { describe, expect, test, vi } from 'vitest'
import { startCompilerPlugin } from '../../src/vite/start-compiler-plugin/plugin'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  linkStartRuntime,
  startBundlers,
} from '../build-harness'
import {
  callServerFnById,
  servedStartRuntime,
  startPlugin,
  startPluginFiles,
  startServerEntryFiles,
} from '../dev-server'
import { callerRpcId, misplacedServerFnRejection } from '../regression-helpers'
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import type { ModuleStub } from '../regression-helpers'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

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
  // handler does not load its server-only import" above). Tree-shaking drops
  // the unused class but keeps the import, so the server-only module's
  // top-level code is bundled and runs in the browser.
  // Impact: server-only modules (database clients, SDKs initialised with
  // secrets) ship to the client and run their top-level code there.
  // Source: gap D2 (gaps/dead-code.md), build canary.
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
   * entry imports another one only server code uses (`serverOnlyFn`), with
   * the server fn resolver the server-fn HTTP handler calls. The resolver is
   * imported by the server-only module, so the SSR build compiles that
   * module (and reports its server fn) before it generates the resolver.
   */
  const clientAccessFiles = {
    'client-fns.ts': `${head}export const clientFn = createServerFn().handler(async () => 'client fn')
`,
    'server-only-fns.ts': `${head}export const serverOnlyFn = createServerFn().handler(async () => 'server-only fn')
export { getServerFnById } from '#tanstack-start-server-fn-resolver'
`,
    'client-entry.ts': `export { clientFn } from './client-fns'
`,
    'ssr-entry.ts': `export { serverOnlyFn, getServerFnById } from './server-only-fns'
${callByIdExports}`,
  }

  /**
   * Builds `clientAccessFiles` and, in the SSR build, sends a request for
   * each server fn id to Start's server entry, as a page does
   * (`callByIdPrelude`), and calls the server-only one from SSR code.
   */
  async function callClientAccess() {
    const { client, ssr } = await buildStart({
      bundler,
      files: clientAccessFiles,
      entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
    })
    expect(client.where("'server-only fn'")).toBe('nowhere')
    const clientFnId = (
      await client.run(`return entry.clientFn.serverFnMeta.id`)
    ).result
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
return {
  clientFn: await overHttp(${JSON.stringify(clientFnId)}),
  serverOnlyFnOverHttp: await overHttp(entry.serverOnlyFn.serverFnMeta.id),
  serverOnlyFnFromSsr: await settle(() => entry.serverOnlyFn()),
}`)
    return result
  }

  // Control for the pin below (same harness).
  test(
    'SSR: a server fn the client references is callable over HTTP, and a server-only one from SSR code',
    async () => {
      expect(await callClientAccess()).toMatchObject({
        clientFn: 'client fn',
        serverOnlyFnFromSsr: 'server-only fn',
      })
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
  // HTTP-callable); the RSC-provider variant is pinned in
  // createServerFn/createServerFn.test.ts.
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
  // only another server fn's handler (or a middleware `.server()`) calls is
  // found later, when the SSR build compiles the provider that imports it, so
  // it is missing from the resolver. Rsbuild rebuilds the resolver after the
  // SSR compilation found every server fn.
  // Impact: in production, calling it throws "Server function info not
  // found" (works in dev).
  // Source: issue #7213.
  ;(bundler === 'vite' ? test.fails : test)(
    'SSR: a server fn that only another server fn calls is callable',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'inner.ts': `${head}export const inner = createServerFn().handler(async () => 'inner')
`,
          'outer.ts': `${head}import { inner } from './inner'
export const outer = createServerFn().handler(async () => 'outer:' + (await inner()))
`,
          'entry.ts': `export { outer } from './outer'\n`,
        },
      })
      expect((await ssr.run(`return await entry.outer()`)).result).toBe(
        'outer:inner',
      )
    },
    timeout,
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
          'node_modules/wrapper-lib/index.js': `import { createServerFn } from '@tanstack/react-start'
export function createLoggedServerFn(handler) {
  return createServerFn().handler(handler)
}
`,
          'src/db.ts': `export const db = { secret: () => 'MARK_WRAPPED_HANDLER' }\n`,
          'src/fns.ts': `import { createLoggedServerFn } from 'wrapper-lib'
import { db } from './db'
export const fn = createLoggedServerFn(async () => db.secret())
`,
          'src/entry.ts': `export { fn } from './fns'\n`,
        },
        entry: 'src/entry.ts',
      }).then(
        async ({ client, ssr }) => ({
          client: client.where('MARK_WRAPPED_HANDLER'),
          ssr: (await ssr.run(`return await entry.fn()`)).result,
        }),
        (error: unknown) => ({ error: String(error) }),
      )
      if ('error' in outcome) {
        expect(outcome.error).toMatch(misplacedServerFnRejection)
        expect(outcome.error).not.toMatch(
          /Expected createServerFn declaration in a statement list/,
        )
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
          'src/entry.ts': `export { middleware, isomorphic } from './both'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect(client.where('MARK_MIDDLEWARE_SERVER')).toBe('nowhere')
      const { result } = await ssr.run(`return {
  middleware: entry.middleware.options.server({ next: (options) => options }),
  isomorphic: entry.isomorphic(),
}`)
      expect(result).toEqual({
        middleware: { context: { marker: 'MARK_MIDDLEWARE_SERVER' } },
        isomorphic: 'server',
      })
    },
    timeout,
  )
})

describe('Vite dev server', () => {
  /**
   * Resolves `'hang'` once `pending` has made no progress for `quietMs`: no
   * plugin hook ran (`lastActivity()`) and the main thread stayed idle (a
   * dependency optimizer bundling, or any other work the request waits for,
   * keeps it busy). Resolves `'settled'` when `pending` settles first, and
   * `'hang'` after `limitMs` at the latest.
   */
  async function settledOrHung(
    pending: Promise<unknown>,
    lastActivity: () => number,
    { quietMs = 1_500, limitMs = 15_000 } = {},
  ): Promise<'settled' | 'hang'> {
    let settled = false
    pending.then(
      () => (settled = true),
      () => (settled = true),
    )
    const started = performance.now()
    let busySince = started
    let previous = performance.eventLoopUtilization()
    while (!settled) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (settled) {
        break
      }
      const current = performance.eventLoopUtilization()
      if (
        performance.eventLoopUtilization(current, previous).utilization > 0.05
      ) {
        busySince = performance.now()
      }
      previous = current
      const now = performance.now()
      const quietFor = now - Math.max(lastActivity(), busySince)
      if (quietFor >= quietMs || now - started >= limitMs) {
        return 'hang'
      }
    }
    return 'settled'
  }

  /**
   * Starts a Vite dev server (middleware mode, empty dependency cache) on a
   * temporary project with the Start compiler, Start's real runtime
   * (`linkStartRuntime`), `src/fn.ts` = `code` and `files`, and requests the
   * client transform of `src/fn.ts`. Returns `'hang'` when the transform
   * stops making progress before it finishes (`settledOrHung`); otherwise
   * its code and the module evaluated with Start's real client runtime
   * (`clientRuntime`) and `zod`.
   */
  async function transformClientModule(
    code: string,
    files: Record<string, string> = {},
  ) {
    // Keep the temporary project inside the package so dependencies resolve.
    const root = await mkdtemp(path.join(__dirname, '.dev-transform-'))
    let server: Awaited<ReturnType<typeof createServer>> | undefined
    let lastActivity = performance.now()
    const active = () => {
      lastActivity = performance.now()
      return null
    }
    try {
      await mkdir(path.join(root, 'src'))
      for (const [file, content] of Object.entries({
        'fn.ts': code,
        ...files,
      })) {
        await writeFile(path.join(root, 'src', file), content)
      }
      await linkStartRuntime(root)
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        cacheDir: path.join(root, '.vite'),
        appType: 'custom',
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        plugins: [
          {
            name: 'record-activity',
            enforce: 'pre',
            resolveId: active,
            load: active,
            transform: active,
          },
          startCompilerPlugin({
            framework: 'react',
            environments: [
              { name: 'client', type: 'client' },
              { name: 'ssr', type: 'server' },
            ],
            providerEnvName: 'ssr',
          }),
        ],
      })
      const transformed =
        server.environments.client.transformRequest('/src/fn.ts')
      if ((await settledOrHung(transformed, () => lastActivity)) === 'hang') {
        transformed.catch(() => {})
        return 'hang' as const
      }
      const served = (await transformed)!.code
      const client = server.environments.client
      const zod = (await import('zod')) as ModuleStub
      const module = await createModuleGraph({
        modules: { '/src/fn.ts': served },
        // Project modules as the dev server serves them.
        load: async (id) =>
          id.startsWith('/src/')
            ? (await client.transformRequest(id))?.code
            : null,
        transform: (source) => source,
        stubs: servedStartRuntime,
        // `zod`, served pre-bundled (`/node_modules/.vite/deps/zod.js`)
        fallbackStub: (specifier) => {
          if (specifier.includes('/zod')) {
            return zod
          }
          throw new Error(`no stub for ${specifier}`)
        },
      }).import('/src/fn.ts')
      return { code: served, module }
    } finally {
      await Promise.race([
        server?.close(),
        new Promise((resolve) => setTimeout(resolve, 3_000)),
      ])
      await rm(root, { recursive: true, force: true })
    }
  }

  /**
   * The client got `fn` as an RPC carrying its id, without the handler body
   * (`MARK_HANDLER`).
   */
  function expectClientRpc(
    result: Awaited<ReturnType<typeof transformClientModule>>,
  ) {
    expect(result).not.toBe('hang')
    const { code, module } = result as Exclude<typeof result, 'hang'>
    expect(code).not.toContain('MARK_HANDLER')
    expect(callerRpcId(module.fn)).toEqual(expect.any(String))
  }

  // Control for the pin below (same harness).
  test('transforms a client module with a server fn and a top-level call of a project function', async () => {
    expectClientRpc(
      await transformClientModule(
        `${head}import { define } from './define'
export const schema = define()
export const fn = createServerFn().handler(() => 'MARK_HANDLER')`,
        { 'define.ts': `export const define = () => ({})` },
      ),
    )
  }, 30_000)

  // Bug: next to a server fn, a top-level `const x = f()` may be a renamed or
  // re-exported Start factory, so in dev the client compiler loads the module
  // of `f` through the client environment, from inside the transform. For a
  // pre-bundled dependency (here `zod`) with an empty dependency cache, that
  // load waits for the dependency optimizer, which waits for this transform.
  // Impact: with an empty dependency cache, such a module (a `z.object()`
  // schema next to a server fn) never finishes transforming when it is
  // requested as the dev server starts (`server.warmup`, the first request
  // of a middleware-mode server, or `transformRequest()`), and the page hangs.
  test.fails(
    'transforms a client module with a server fn and a top-level call of a pre-bundled dependency',
    async () => {
      expectClientRpc(
        await transformClientModule(
          `${head}import { z } from 'zod'
export const schema = z.object({})
export const fn = createServerFn().handler(() => 'MARK_HANDLER')`,
        ),
      )
    },
    30_000,
  )

  /**
   * Starts a Vite dev server (middleware mode) with Start's Vite plugin on
   * `root` (which links Start's real runtime and has `startAppFiles`), with
   * SSR as the server fn provider.
   */
  function startServerFnDevServer(root: string) {
    return createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      cacheDir: path.join(root, '.vite'),
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      plugins: [startPlugin(root, {}, undefined)],
    })
  }

  /**
   * The files of Start's plugin (`startPluginFiles`), with Start's default
   * server entry (`startServerEntryFiles`), which handles server fn calls.
   */
  const startAppFiles = { ...startPluginFiles, ...startServerEntryFiles }

  /**
   * In a temporary project with `src/fns.ts` = a `greet` server fn, reads the
   * id of `greet` through a first dev server, then calls the id the way a
   * page does (`callServerFnById`: Start's server entry handles it) on a dev
   * server started with `fresh` (a new server, which has compiled nothing)
   * or on the same server. Returns the result or the error message.
   */
  async function callServerFnId(fresh: boolean) {
    const root = await mkdtemp(path.join(__dirname, '.dev-server-fn-'))
    const servers: Array<Awaited<ReturnType<typeof createServer>>> = []
    try {
      for (const [file, code] of Object.entries({
        ...startAppFiles,
        'src/fns.ts': `${head}export const greet = createServerFn().handler(() => 'hello')\n`,
      })) {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true })
        await writeFile(path.join(root, file), code)
      }
      await linkStartRuntime(root)
      /** Imports a module in the SSR environment of a dev server. */
      const importSsr = (
        server: Awaited<ReturnType<typeof createServer>>,
        id: string,
      ) => {
        const ssr = server.environments.ssr
        if (!ssr || !isRunnableDevEnvironment(ssr)) {
          throw new Error('expected a runnable SSR environment')
        }
        return ssr.runner.import(id)
      }
      const first = await startServerFnDevServer(root)
      servers.push(first)
      const { greet } = await importSsr(first, '/src/fns.ts')
      let server = first
      if (fresh) {
        await servers.pop()!.close()
        server = await startServerFnDevServer(root)
        servers.push(server)
      }
      const ssr = server
      // Start's server logs the error of a failed call (a Vite plugin error
      // here), which Vitest's console forwarding does not survive.
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        return await callServerFnById(
          { import: (id) => importSsr(ssr, id) },
          greet.serverFnMeta.id,
        )
      } catch (error) {
        return `throws: ${(error as Error).message}`
      } finally {
        logged.mockRestore()
      }
    } finally {
      for (const server of servers) {
        await server.close()
      }
      await rm(root, { recursive: true, force: true })
    }
  }

  // Control for the pin below (same harness).
  test('calls a server fn id on the dev server that compiled its module', async () => {
    expect(await callServerFnId(false)).toBe('hello')
  }, 30_000)

  // Bug: when a server fn id is not registered yet, the dev validator
  // (`validate-server-fn-id`) transforms the source file under
  // `?server-fn-module-lookup`, the one id the compiling transform excludes,
  // so the id is never registered and the validator rejects it.
  // Impact: after a dev server restart, calling a server fn whose module the
  // new server has not compiled yet (e.g. from a page loaded before the
  // restart) fails with "Invalid server function ID" (500).
  // Source: issue #8447, gap SF8 (gaps/start-env.md).
  test.fails(
    'calls a server fn id on a fresh dev server that has not compiled its module',
    async () => {
      expect(await callServerFnId(true)).toBe('hello')
    },
    30_000,
  )
})
