/**
 * Dev-server harness of the Start compiler: a Vite dev server with the
 * plugins a Start app's `vite.config.ts` lists, `tanstackStart()` of the
 * built framework package (`@tanstack/react-start/plugin/vite`, or
 * `@tanstack/solid-start`'s; see `start-plugins.ts`: client and SSR
 * environments, SSR as the server fn provider) and the app's other plugins
 * (a React app's `@vitejs/plugin-react` unless the test gives it), on a
 * temporary app, through the shared dev-server harness
 * (`@tanstack/compiler-test-utils/dev-server`). The framework package's
 * configuration, Start's dev server hooks, Start compiler, import
 * protection, router generator, route tree client plugin and start manifest
 * all run, as in an app. `@tanstack/react-start` is the real package
 * (`startRuntimeLinks`), and `@tanstack/react-router` the real one too (a
 * dependency of this package). The temporary apps stand in for apps in this
 * directory (`@tanstack/compiler-test-utils/app-directory`).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginNames } from '@tanstack/compiler-test-utils/build-harness'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import react from '@vitejs/plugin-react'
import { onTestFinished } from 'vitest'
import { startRuntimeLinks } from './build-harness'
import { inProbeRequest, requestFiles } from './request-probe'
import { startPlugins } from './start-plugins'
import type { TanStackStartViteInputConfig } from '../src/vite'
import type { PluginOption } from 'vite'
import type {
  DevServer,
  DevServerOptions,
} from '@tanstack/compiler-test-utils/dev-server'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

export interface StartDevServerOptions extends Omit<
  DevServerOptions,
  'dir' | 'plugins'
> {
  /**
   * Other plugins of the app (e.g. a Solid app's JSX plugin), after Start's,
   * or a function of the app root returning them. A React app gets
   * `@vitejs/plugin-react` unless these include it.
   */
  plugins?:
    | Array<PluginOption>
    | ((app: { root: string }) => Array<PluginOption>)
  /**
   * The app's Start plugin options (`tanstackStart(options)`; default
   * `{}`). The app's client and server entries are the harness's empty
   * ones (`client.entry`, `server.entry`) unless the app has its own, and
   * `src/router.ts` and `src/routes/__root.tsx` are stubs unless the app has
   * them (`startPluginFiles`).
   */
  start?: TanStackStartViteInputConfig
  /**
   * The Start framework package of the app (default `react`): Start's
   * plugin is that package's `tanstackStart()`, and `solid` links the built
   * `@tanstack/solid-start` and `@tanstack/solid-router` (a Solid app's
   * dependencies; its JSX plugin, `vite-plugin-solid`, comes from
   * `plugins`).
   */
  framework?: 'react' | 'solid'
}

/**
 * The server entry of an app whose server handles HTTP requests: Start's
 * default one (`@tanstack/react-start/server-entry`).
 */
export const startServerEntryFiles = {
  'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
}

/**
 * The files of an app whose server code a test runs inside a real request
 * (`inDevRequest`): Start's default server entry (`startServerEntryFiles`)
 * and what a request needs (`requestFiles` of `request-probe.ts`): a real
 * router over the generated route tree, its root route and the probe route.
 * An app's own router entry must export a real router whose tree has the
 * probe route.
 */
export const startRequestFiles = {
  ...startServerEntryFiles,
  ...requestFiles('@tanstack/react-router'),
}

/**
 * Runs `run` inside a real request of a dev server whose app has
 * `startRequestFiles`: the app's server entry (Start's `fetch`, imported in
 * the SSR environment, as Start's dev server middleware calls it) serves a
 * request for the probe route, whose handler runs `run`; so Start's request
 * context is the one its server entry opens. Gives what `run` returned, or
 * throws what it threw.
 */
export async function inDevRequest<T>(
  server: Pick<DevServer, 'import'>,
  run: () => T | Promise<T>,
): Promise<Awaited<T>> {
  // The app's server entry, by its path (`startServerEntryFiles`).
  const serverEntry = (await server.import('/harness/server-entry.ts')).default
  return await inProbeRequest(
    (url) => serverEntry.fetch(new Request(new URL(url, 'http://localhost'))),
    async () => await run(),
  )
}

/**
 * Calls the server fn `fn` (a server fn the SSR environment evaluated, or
 * its URL) of a dev server whose app has `startRequestFiles` the way a page
 * of the same origin does: Start's client RPC sends its GET request to the
 * app's server entry (its `fetch`, which Start's dev server middleware
 * calls in the SSR environment; the browser adds `Sec-Fetch-Site`, which
 * Start's CSRF middleware checks). The server fn is identified by its
 * public `url` (SPEC J4.1: the server fn base, then its id), never by
 * Start's own metadata fields (§5.19); a value without such a URL throws
 * before any request. Gives the decoded result or throws the decoded
 * error, like the client's server fn.
 */
export async function callServerFn(
  server: Pick<DevServer, 'import'>,
  fn: { url?: unknown } | string | undefined,
  data?: unknown,
): Promise<unknown> {
  const { createClientRpc } = await server.import(
    '@tanstack/react-start/client-rpc',
  )
  // The app's server entry, by its path (`startServerEntryFiles`).
  const serverEntry = (await server.import('/harness/server-entry.ts')).default
  const fetch = (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers)
    headers.set('sec-fetch-site', 'same-origin')
    return serverEntry.fetch(
      new Request(new URL(url, 'http://localhost'), { ...init, headers }),
    )
  }
  // Start's client RPC imported through the SSR environment reads Start's
  // options from the request context (`getStartOptions`): the call runs
  // inside a real request of the app (`inDevRequest`), as server code that
  // calls a server fn does.
  const reply = (await inDevRequest(server, () => {
    const base = createClientRpc('').url as string
    const url = typeof fn === 'string' ? fn : fn?.url
    if (
      typeof url !== 'string' ||
      !url.startsWith(base) ||
      url.length === base.length
    ) {
      throw new Error(`not a server fn URL: ${String(url)}`)
    }
    return createClientRpc(url.slice(base.length))({
      data,
      method: 'GET',
      fetch,
    })
  })) as { result: unknown } | { error: unknown }
  if ('error' in reply) {
    throw reply.error
  }
  return reply.result
}

/** The files the harness adds to every app, unless the app has them. */
export const startPluginFiles = {
  'harness/client-entry.ts': `export {}\n`,
  'harness/server-entry.ts': `export {}\n`,
  'src/router.ts': `export const getRouter = () => undefined\n`,
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
}

/**
 * Start's Vite plugins of an app at `root`: `tanstackStart(start)` of the
 * framework package, with the harness's entries (`harness/client-entry.ts`,
 * `harness/server-entry.ts`) where the app has none.
 */
export function startPlugin(
  root: string,
  start: TanStackStartViteInputConfig,
  framework: 'react' | 'solid' = 'react',
) {
  const entries = {
    client: path.join(root, 'harness/client-entry.ts'),
    server: path.join(root, 'harness/server-entry.ts'),
  }
  return startPlugins(framework, root, start, entries)
}

/** Starts a Vite dev server with Start's plugin on an app of `files`. */
export function startDevServer(
  options: StartDevServerOptions,
): Promise<DevServer> {
  const {
    files,
    plugins = [],
    start = {},
    framework = 'react',
    ...devServerOptions
  } = options
  return createDevServer({
    dir: harnessDir,
    prefix: '.start-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    files: {
      ...startPluginFiles,
      ...files,
    },
    symlinks: {
      ...startRuntimeLinks(framework),
      ...devServerOptions.symlinks,
    },
    plugins: ({ root }) => {
      const appPlugins =
        typeof plugins === 'function' ? plugins({ root }) : plugins
      return [
        startPlugin(root, start, framework),
        // A React app's own Vite plugin, as in every React Start app,
        // unless the test gives it
        ...(framework === 'react' &&
        !pluginNames(appPlugins).some((name) => name.startsWith('vite:react'))
          ? [react()]
          : []),
        ...appPlugins,
      ]
    },
  })
}
