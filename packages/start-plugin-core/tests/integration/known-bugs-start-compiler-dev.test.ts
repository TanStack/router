// Slow-tier part of known-bugs-start-compiler: the Vite dev server tests
// (its own file, so that they run beside the build tests). Builds:
// known-bugs-start-compiler.test.ts; in-process tests:
// ../known-bugs-start-compiler.test.ts.
/**
 * Known Start compiler bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { createServer, isRunnableDevEnvironment } from 'vite'
import { describe, expect, test, vi } from 'vitest'
import { linkStartRuntime } from '../build-harness'
import {
  callServerFnById,
  startPlugin,
  startPluginFiles,
  startServerEntryFiles,
} from '../dev-server'
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
   * Starts a Vite dev server (middleware mode, empty dependency cache) on a
   * temporary project with Start's whole Vite plugin, Start's real runtime
   * (`linkStartRuntime`), `src/fn.ts` = `code` and `files` (in `src`), and
   * requests the client transform of `src/fn.ts`, as the first request of
   * the server. Returns `'hang'` when the transform stops making progress
   * before it finishes (`settledOrHung`); otherwise the code it served.
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
        server: { middlewareMode: true, hmr: false, ws: false, watch: null },
        plugins: [
          {
            name: 'record-activity',
            enforce: 'pre',
            resolveId: active,
            load: active,
            transform: active,
          },
          startPlugin(root, {}, undefined),
        ],
      })
      const transformed =
        server.environments.client.transformRequest('/src/fn.ts')
      if ((await settledOrHung(transformed, () => lastActivity)) === 'hang') {
        transformed.catch(() => {})
        return 'hang' as const
      }
      return { code: (await transformed)!.code }
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
   * (`MARK_HANDLER`): the first request of a fresh dev server finishes
   * (`transformClientModule`) without the handler, and a real page of a dev
   * server of the same app runs `fn` as an RPC (its URL carries its id).
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
      `return { id: entry.fn.serverFnMeta?.id, url: entry.fn.url }`,
    )
    const { id } = rpc as { id: unknown }
    expect(rpc).toEqual({
      id: expect.any(String),
      url: expect.stringMatching(new RegExp(`${String(id)}$`)),
    })
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
  // finishes transforming when it is requested as the dev server starts
  // (`server.warmup`, the first request of a middleware-mode server, or
  // `transformRequest()`), and the page hangs.
  test.fails(
    'transforms a client module with a server fn and a top-level call of a pre-bundled dependency',
    async () => {
      await expectClientRpc(
        `${head}import { object } from 'zod'
export const schema = object({})
export const fn = createServerFn().handler(() => 'MARK_HANDLER')`,
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
