// Slow-tier part of known-bugs-start-compiler: the Vite dev server tests
// (its own file, so that they run beside the build tests). Builds:
// known-bugs-start-compiler.test.ts; in-process tests:
// ../known-bugs-start-compiler.test.ts.
/**
 * Known Start compiler bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createServer, isRunnableDevEnvironment } from 'vite'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { createAppDirectory } from '@tanstack/compiler-test-utils/app-directory'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { closeViteServer } from '@tanstack/compiler-test-utils/dev-server'
import { linkStartRuntime } from '../build-harness'
import {
  callServerFn,
  startDevServer,
  startPlugin,
  startPluginFiles,
  startRequestFiles,
} from '../dev-server'
import { reactApp } from './hydrate-dev-edits'
import {
  runViteClient,
  startBrowserStartDevServer,
} from './importProtection/client-pages'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

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
    // Read through a function: the callbacks above set it.
    const isSettled = () => settled
    const started = performance.now()
    let busySince = started
    let previous = performance.eventLoopUtilization()
    while (!isSettled()) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (isSettled()) {
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
   * Creates a Vite dev server (empty dependency cache) on a temporary project
   * with Start's whole Vite plugin, Start's real runtime (`linkStartRuntime`),
   * `src/fn.ts` = `code` and `files` (in `src`), requests the client
   * transform of `src/fn.ts`, and starts the server (`listen()`) once Vite
   * loads that module. The transform is then in flight when Vite's dependency
   * optimizer starts, so it is part of the optimizer's first crawl of static
   * imports (the optimizer's first run waits for it), whatever the timing. A
   * request made after the server started joins that crawl only when it
   * reaches Vite within 50 ms of the optimizer's start, which a loaded machine
   * can miss. Returns `'hang'` when the transform stops making progress
   * before it finishes (`settledOrHung`); otherwise the code it served.
   */
  async function transformClientModule(
    code: string,
    files: Record<string, string> = {},
  ) {
    // A temporary project whose dependencies resolve as from this directory
    const root = await createAppDirectory(__dirname, '.dev-transform-')
    let server: Awaited<ReturnType<typeof createServer>> | undefined
    let lastActivity = performance.now()
    const active = () => {
      lastActivity = performance.now()
      return null
    }
    const fnFile = path.join(root, 'src/fn.ts')
    let fnLoading!: () => void
    // Vite calls the load hooks of a module once it tracks its request
    const fnLoaded = new Promise<void>((resolve) => (fnLoading = resolve))
    let hung = false
    try {
      for (const [file, content] of Object.entries({
        ...startPluginFiles,
        ...Object.fromEntries(
          Object.entries({ 'fn.ts': code, ...files }).map(([name, source]) => [
            `src/${name}`,
            source,
          ]),
        ),
      })) {
        await mkdir(path.dirname(path.join(root, file)), { recursive: true })
        await writeFile(path.join(root, file), content)
      }
      await linkStartRuntime(root)
      server = await createServer({
        root,
        configFile: false,
        logLevel: 'silent',
        cacheDir: path.join(root, '.vite'),
        appType: 'custom',
        // One address, as the harness's other servers: 127.0.0.1, because of
        // Node's address-family selection
        server: { host: '127.0.0.1', hmr: false, ws: false, watch: null },
        plugins: [
          {
            name: 'record-activity',
            enforce: 'pre',
            resolveId: active,
            load(id) {
              if (id === fnFile) {
                fnLoading()
              }
              return active()
            },
            transform: active,
          },
          startPlugin(root, {}),
        ],
      })
      // A server that is not listening yet has not started its dependency
      // optimizer (Vite starts it in `listen()`)
      const transformed =
        server.environments.client.transformRequest('/src/fn.ts')
      await Promise.race([fnLoaded, transformed.catch(() => {})])
      await server.listen()
      if ((await settledOrHung(transformed, () => lastActivity)) === 'hang') {
        hung = true
        transformed.catch(() => {})
        return 'hang' as const
      }
      return { code: (await transformed)!.code }
    } finally {
      // A hung server's optimizer waits for the hung transform: it writes
      // nothing more, and `close()` may wait for that transform
      await (hung
        ? Promise.race([
            server?.close(),
            new Promise((resolve) => setTimeout(resolve, 3_000)),
          ])
        : server && closeViteServer(server))
      await rm(root, { recursive: true, force: true })
    }
  }

  /**
   * The client got `fn` as an RPC carrying its id, without the handler body
   * (`MARK_HANDLER`): the first request of a fresh dev server finishes
   * (`transformClientModule`) without the handler, and a real page of a dev
   * server of the same app runs `fn` as an RPC (its public `url`; the dev id
   * is implementation-specific, J4.4).
   */
  async function expectClientRpc(
    code: string,
    files: Record<string, string> = {},
  ) {
    const result = await transformClientModule(code, files)
    expect(result).not.toBe('hang')
    expect((result as Exclude<typeof result, 'hang'>).code).not.toContain(
      'MARK_HANDLER',
    )
    const server = await startBrowserStartDevServer({
      files: Object.fromEntries(
        Object.entries({ 'fn.ts': code, ...files }).map(([name, source]) => [
          `src/${name}`,
          source,
        ]),
      ),
    })
    const { result: rpc } = await runViteClient(
      server,
      '/src/fn.ts',
      `return { url: entry.fn.url }`,
    )
    expect(rpc).toEqual({ url: expect.any(String) })
  }

  // Control for the pin below (same harness).
  test('transforms a client module with a server fn and a top-level call of a project function', async () => {
    await expectClientRpc(
      `${head}import { define } from './define'
export const schema = define()
export const fn = createServerFn().handler(() => 'MARK_HANDLER')`,
      { 'define.ts': `export const define = () => ({})` },
    )
  }, 30_000)

  // Regression (was a pin; fixed on main by #8758): a `z.object()` schema next
  // to a server fn, with an empty dependency cache, used to never finish
  // transforming in dev. The client compiler loaded `zod` through the client
  // environment from inside the transform, and that load waited for the
  // dependency optimizer, which waited for this transform.
  test('transforms a client module with a server fn and a top-level member call of a pre-bundled dependency', async () => {
    await expectClientRpc(
      `${head}import { z } from 'zod'
export const schema = z.object({})
export const fn = createServerFn().handler(() => 'MARK_HANDLER')`,
    )
  }, 30_000)

  // Bug: next to a server fn, a top-level `const x = f()` may be a renamed or
  // re-exported Start factory, so in dev the client compiler loads the module
  // of `f` through the client environment, from inside the transform. For a
  // pre-bundled dependency (here `zod`) with an empty dependency cache, that
  // load waits for the dependency optimizer, which waits for this transform.
  // (#8758 skips this load for `receiver.method()` calls on a named import,
  // as in the regression test above, but not for a call of the import itself.)
  // Source: the pin of the `z.object()` row above, before #8758.
  // Impact: with an empty dependency cache, such a module (an `object()`
  // schema from `import { object } from 'zod'` next to a server fn) never
  // finishes transforming when its transform is part of Vite's first crawl of
  // static imports: requested before the server listens, or within about
  // 50 ms of the dependency optimizer's start (`server.warmup`, the first
  // request of a middleware-mode server), and the page hangs.
  test('transforms a client module with a server fn and a top-level call of a pre-bundled dependency', async () => {
    await expectClientRpc(
      `${head}import { object } from 'zod'
export const schema = object({})
export const fn = createServerFn().handler(() => 'MARK_HANDLER')`,
    )
  }, 30_000)

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
      plugins: [startPlugin(root, {})],
    })
  }

  /**
   * The files of Start's plugin (`startPluginFiles`), with Start's default
   * server entry and what a request needs (`startRequestFiles`): Start's
   * server entry handles server fn calls.
   */
  const startAppFiles = { ...startPluginFiles, ...startRequestFiles }

  /**
   * In a temporary project with `src/fns.ts` = a `greet` server fn, reads the
   * id of `greet` through a first dev server, then calls the id the way a
   * page does (`callServerFn`: Start's server entry handles it) on a dev
   * server started with `fresh` (a new server, which has compiled nothing)
   * or on the same server. Returns the result or the error message.
   */
  async function callServerFnId(fresh: boolean) {
    const root = await createAppDirectory(__dirname, '.dev-server-fn-')
    const servers: Array<Awaited<ReturnType<typeof createServer>>> = []
    try {
      for (const [file, code] of Object.entries({
        ...startAppFiles,
        'src/fns.ts': `${head}export const greet = createServerFn().handler(() => 'hello')\n`,
        // The page that was loaded before the restart imports `greet`: only
        // a server fn client code references is callable by id (J4.2, in
        // development too).
        'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { greet } from '../fns'
export const Route = createFileRoute('/')({ loader: () => greet() })
`,
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
        if (!isRunnableDevEnvironment(ssr)) {
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
        return await callServerFn({ import: (id) => importSsr(ssr, id) }, greet)
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
  // Source: issue #8447.
  test('calls a server fn id on a fresh dev server that has not compiled its module', async () => {
    expect(await callServerFnId(true)).toBe('hello')
  }, 30_000)

  // SPEC J4.16, G13, G1: a library Start's discovery selects (a peer
  // dependency on `@tanstack/react-start`) keeps working in dev as in a
  // build, including what it imports from a CommonJS dependency.
  // Bug: Start puts the libraries it discovers in the client's
  // `optimizeDeps.exclude`, so Vite serves them as source and their
  // CommonJS dependency reaches the browser untransformed ("does not provide
  // an export named 'parse'").
  // Source: src/vite/plugin.ts (crawlFrameworkPkgs), src/vite/planning.ts
  // (`optimizeDeps.exclude`); issues #5738, #6361.
  // Impact: in dev, a client route using such a library does not run.
  test.fails(
    "a Start library's import of a CommonJS dependency works in a client route",
    async () => {
      const cwd = process.cwd()
      let server: Awaited<ReturnType<typeof startDevServer>>
      try {
        server = await startDevServer({
          browser: true,
          files: {
            ...reactApp,
            'package.json': JSON.stringify({
              name: 'app',
              private: true,
              type: 'module',
              dependencies: { 'start-lib': '*' },
            }),
            'node_modules/start-lib/package.json': JSON.stringify({
              name: 'start-lib',
              type: 'module',
              exports: './index.js',
              peerDependencies: { '@tanstack/react-start': '*' },
            }),
            'node_modules/start-lib/index.js': `import { parse } from 'cjs-dep'
export const format = (value) => 'lib ' + parse(value)
`,
            'node_modules/cjs-dep/package.json': JSON.stringify({
              name: 'cjs-dep',
              main: './index.js',
            }),
            'node_modules/cjs-dep/index.js': `exports.parse = (value) => 'parsed:' + value\n`,
            'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { format } from 'start-lib'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  const [text, setText] = useState('')
  return <button data-testid="lib" onClick={() => setText(format('x'))}>clicked {text}</button>
}
`,
          },
          // `vite dev` runs in the app's directory, whose package.json
          // Start reads to discover the libraries
          plugins: ({ root }) => {
            process.chdir(root)
            return []
          },
        })
      } finally {
        process.chdir(cwd)
      }
      const browser = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await browser.waitForText('hydrated', {
        selector: '[data-testid=hydrated]',
      })
      await browser.page.locator('[data-testid=lib]').click()
      await browser.waitForText('clicked lib parsed:x', {
        selector: '[data-testid=lib]',
        timeout: 5_000,
      })
      expect(browser.errors).toEqual([])
    },
    60_000,
  )
})
