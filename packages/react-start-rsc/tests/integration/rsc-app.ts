/**
 * Real React Start apps with RSC enabled, for tests of what the RSC CSS
 * transform and Start's RSC wiring do end to end: a Vite dev server
 * (`startRscDevServer`) runs the app the way `vite dev` does, with the built
 * `@tanstack/react-start` (`tanstackStart({ rsc: { enabled: true } })` of its
 * `plugin/vite` entry, linked into the app's `node_modules`), Vite's own RSC
 * plugin (`@vitejs/plugin-rsc`, the three environments `client`, `ssr` and
 * `rsc`) and `@vitejs/plugin-react`. With `browser`, a real page
 * (`@tanstack/compiler-test-utils/browser`) loads the app over HTTP through
 * Start's own dev server middleware (SSR), Vite's HMR client and React
 * Refresh; Vite's own watcher reports the test's file edits (`write()`).
 *
 * The temporary apps stand in for apps in this directory
 * (`@tanstack/compiler-test-utils/app-directory`): their bare imports (`react`,
 * `@tanstack/react-router`, `@vitejs/plugin-rsc`, ...) resolve to this
 * package's dependencies, as in an installed app. `@tanstack/react-start`
 * is not one of them (it depends on this package), so the built workspace
 * package is linked (`workspacePackageLinks`); the `test:integration` Nx
 * target depends on its `build`.
 *
 * Each opener takes the directory it makes its app in (a test's `appRoot`,
 * a file's `fileRoot`) and returns what it opened with its `close()`; the
 * test's fixtures (`./test`) bind them to the test.
 */
import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import rsc from '@vitejs/plugin-rsc'
import { pluginReact } from '@rsbuild/plugin-react'
import { holdNodeEnv } from '@tanstack/compiler-test-utils/node-env'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import {
  createRsbuildDevServer,
  trackCompiles,
} from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import {
  createApp,
  pluginNames,
  stripAnsi,
  withBuildEnvironment,
} from '@tanstack/compiler-test-utils/build-harness'
import { createBuilder, mergeConfig, preview } from 'vite'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { expect } from 'vitest'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'
import type { Page } from '@tanstack/compiler-test-utils/test'
import type {
  DevServer,
  DevServerOptions,
} from '@tanstack/compiler-test-utils/dev-server'
import type {
  RsbuildDevServer,
  RsbuildDevServerOptions,
} from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** The test's browser (the `browser` fixture). */
export type Browser = NonNullable<
  ReturnType<ReturnType<Page['context']>['browser']>
>

/**
 * Node's own `import()`, outside Vitest's module runner (as
 * start-plugin-core's `start-compose-app.ts` uses it): a plugin loaded with
 * it imports the built server bundle as Node does.
 */
const nativeImport = createRequire(import.meta.url)(
  '../../../compiler-test-utils/src/native-import.cjs',
) as (specifier: string) => Promise<Record<string, any>>

/**
 * Resolve the installed public export with Node, independent of dist
 * layout; with `native`, loaded by Node itself (`nativeImport`).
 */
async function tanstackStartPlugin(
  parent: string,
  bundler: 'vite' | 'rsbuild',
  native = false,
): Promise<(options?: Record<string, unknown>) => unknown> {
  const app = await createApp({
    dir: harnessDir,
    parent,
    prefix: '.rsc-plugin-import-',
    files: {
      'plugin.mjs': `export { tanstackStart } from '@tanstack/react-start/plugin/${bundler}'`,
    },
    symlinks: workspacePackageLinks(['@tanstack/react-start']),
  })
  try {
    const url = pathToFileURL(path.join(app.root, 'plugin.mjs')).href
    return (
      native ? await nativeImport(url) : await import(/* @vite-ignore */ url)
    ).tanstackStart
  } finally {
    await app.dispose()
  }
}

/**
 * The files every app has unless it brings its own: Start's router entry
 * (the real router over the generated route tree) and a root route that
 * renders the document with Start's `HeadContent` and `Scripts`, so pages
 * hydrate and load the client.
 */
export const rscAppFiles = {
  'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
        <Scripts />
      </body>
    </html>
  )
}
`,
}

export interface RscDevServerOptions extends Omit<
  DevServerOptions,
  'dir' | 'parent' | 'plugins' | 'registerCleanup'
> {
  /** Start's plugin options (`tanstackStart(options)`), `rsc` enabled. */
  start?: Record<string, unknown>
}

/**
 * Starts a Vite dev server on a React Start app with RSC enabled, of
 * `files` over `rscAppFiles`. Without `browser`, the server runs in
 * middleware mode (Vite's watcher still reports `write()`s, which
 * `settle()` waits for); the `rsc` environment is runnable
 * (`server.import(url, 'rsc')` runs a module in the provider).
 */
export async function startRscDevServer(
  parent: string,
  options: RscDevServerOptions,
): Promise<DevServer> {
  const { files, start, config, ...devServerOptions } = options
  const tanstackStart = await tanstackStartPlugin(parent, 'vite')
  return createDevServer({
    dir: harnessDir,
    parent,
    prefix: '.rsc-dev-server-',
    ...devServerOptions,
    files: { ...rscAppFiles, ...files },
    // An app may also import this package directly (`@tanstack/react-start-rsc`).
    symlinks: {
      ...workspacePackageLinks([
        '@tanstack/react-start',
        '@tanstack/react-start-rsc',
      ]),
      ...devServerOptions.symlinks,
    },
    config: mergeConfig(
      {
        // Start serves the pages (SSR through its dev middleware), not
        // Vite's SPA fallback.
        appType: 'custom',
        // Pre-bundled up front, as Vite does once a page discovers them
        // (the dependencies of Start's client RPC and of the Flight decoder,
        // which the browser imports on the first server function call and
        // the first decode): a discovery mid-test re-optimises and reloads
        // the page.
        optimizeDeps: {
          include: [
            '@tanstack/react-router > @tanstack/router-core > seroval',
            '@tanstack/react-router > @tanstack/router-core > seroval-plugins/web',
            '@tanstack/react-start > @tanstack/start-server-core > cookie-es',
            '@vitejs/plugin-rsc/vendor/react-server-dom/client.browser',
          ],
        },
      },
      config ?? {},
    ),
    plugins: [
      tanstackStart({ ...start, rsc: { enabled: true } }) as never,
      rsc(),
      react(),
    ],
  })
}

export interface RscPreviewServer {
  /** The app root. */
  root: string
  /** The URL Start's preview server listens on. */
  url: string
  /** What the build logged (warnings and errors). */
  messages: Array<string>
  /** Closes the server. */
  close: () => Promise<void>
}

/** What `buildRscApp` and its callers take. */
export interface RscBuildOptions {
  files: Record<string, string>
  start?: Record<string, unknown>
  config?: Record<string, unknown>
  signal?: AbortSignal
}

/**
 * Builds a React Start app with RSC enabled, of `files` over `rscAppFiles`,
 * for production as `vite build` does (the `client`, `ssr` and `rsc`
 * environments, `buildApp()`). `built`: the build's rejection, if it
 * failed (null: it built).
 */
async function buildRscApp(parent: string, options: RscBuildOptions) {
  const tanstackStart = await tanstackStartPlugin(parent, 'vite')
  const app = await createApp({
    dir: harnessDir,
    parent,
    signal: options.signal,
    prefix: '.rsc-preview-server-',
    files: { ...rscAppFiles, ...options.files },
    symlinks: workspacePackageLinks([
      '@tanstack/react-start',
      '@tanstack/react-start-rsc',
    ]),
  })
  const config = () =>
    mergeConfig(
      {
        root: app.root,
        configFile: false,
        logLevel: 'warn',
        plugins: [
          tanstackStart({ ...options.start, rsc: { enabled: true } }),
          rsc(),
          react(),
        ],
      },
      options.config ?? {},
    )
  const reported: Array<ChannelDiagnostic> = []
  const built = await withBuildEnvironment('production', reported, async () => {
    const builder = await createBuilder(config())
    await builder.buildApp()
  }).then(
    () => null,
    (error: unknown) => error,
  )
  const messages = reported.map(({ text }) => text)
  return { root: app.root, config, messages, built }
}

/**
 * Builds a React Start app with RSC enabled for production (`buildRscApp`)
 * and serves the build with `vite preview` (Start's own preview server
 * runs the built server entry). The test process runs with
 * `NODE_ENV=production`, as `vite preview` does, so the
 * server's React matches the client's until `close()`. No `vite build --watch`
 * counterpart: `@vitejs/plugin-rsc`'s watch build exits before its server
 * output exists (KNOWN-BUGS, "Upstream issues").
 */
export async function startRscPreviewServer(
  parent: string,
  options: RscBuildOptions,
): Promise<RscPreviewServer> {
  const { root, config, messages, built } = await buildRscApp(parent, options)
  if (built !== null) {
    throw built
  }
  options.signal?.throwIfAborted()
  // (`vite preview` runs under it, for as long as the server serves)
  const { result: server, release: releaseNodeEnv } = await holdNodeEnv(
    'production',
    () =>
      preview({
        ...config(),
        // Vite's default port: the server binds the next free port itself
        // (`port: 0` makes Vite 8 probe a port and bind it after, which
        // another process can take meanwhile).
        preview: { host: '127.0.0.1' },
      }),
  )
  const close = async () => {
    try {
      await server.close()
    } finally {
      releaseNodeEnv()
    }
  }
  const url = server.resolvedUrls?.local[0]
  if (!url) {
    await close()
    throw new Error('the preview server does not listen')
  }
  return { root, url, messages, close }
}

/**
 * Builds a React Start app with RSC enabled for production (`buildRscApp`)
 * that must fail: the message of the build's rejection, without colours
 * (throws if it built).
 */
export async function failedRscBuild(
  parent: string,
  options: RscBuildOptions,
): Promise<{
  root: string
  error: string
}> {
  const { root, built } = await buildRscApp(parent, options)
  if (built === null) {
    throw new Error('the build succeeded')
  }
  return {
    root,
    error: stripAnsi(built instanceof Error ? built.message : String(built)),
  }
}

/**
 * `startRscPreviewServer` with `bundler: 'vite'`,
 * `startRscRsbuildPreviewServer` with `'rsbuild'`.
 */
export function serveRscBuild(
  parent: string,
  { bundler, ...options }: RscBuildOptions & { bundler: 'vite' | 'rsbuild' },
): Promise<RscPreviewServer> {
  return bundler === 'vite'
    ? startRscPreviewServer(parent, options)
    : startRscRsbuildPreviewServer(parent, options)
}

/** The bound of a watch mode build's first build, and of an edit's rebuild. */
const watchTimeout = 60_000

/** What `startRscRsbuildPreviewServer` uses of Rsbuild's JavaScript API. */
interface RsbuildApi {
  createRsbuild: (options: {
    cwd: string
    rsbuildConfig: Record<string, unknown>
  }) => Promise<{
    build: (options?: {
      watch?: boolean
    }) => Promise<{ close: () => Promise<void> }>
    preview: (options?: { getPortSilently?: boolean }) => Promise<{
      urls: Array<string>
      server: { close: () => Promise<void> }
    }>
  }>
}

/**
 * Rsbuild's JavaScript API: the copy the shared Rsbuild harness runs
 * (a dependency of `@tanstack/compiler-test-utils`, which this package's
 * tests do not declare themselves).
 */
async function rsbuildApi(): Promise<RsbuildApi> {
  const harness = createRequire(import.meta.url).resolve(
    '@tanstack/compiler-test-utils/rsbuild-dev-server',
  )
  const rsbuild = createRequire(harness).resolve('@rsbuild/core')
  return (await import(
    /* @vite-ignore */ pathToFileURL(rsbuild).href
  )) as RsbuildApi
}

/**
 * Builds a React Start app with RSC enabled, of `files` over `rscAppFiles`,
 * for production as `rsbuild build` does in the app's directory (the
 * built `@tanstack/react-start/plugin/rsbuild` and `@rsbuild/plugin-react`,
 * as for `startRscRsbuildDevServer`), and serves the build as `rsbuild
 * preview` does (Start's own middleware runs the built server entry). The
 * test process runs with `NODE_ENV=production` until `close()`, as for
 * `startRscPreviewServer`. `errors`: what the build reported as errors
 * (a failed build rejects with them, an `AggregateError`).
 */
export async function startRscRsbuildPreviewServer(
  parent: string,
  options: RscRsbuildBuildOptions,
): Promise<RscPreviewServer & { errors: Array<string> }> {
  // Loaded by Node: Start's preview middleware imports the built server
  // bundle, which Node runs, not Vitest's module runner
  const tanstackStart = await tanstackStartPlugin(parent, 'rsbuild', true)
  const { createRsbuild } = await rsbuildApi()
  const app = await createApp({
    dir: harnessDir,
    parent,
    signal: options.signal,
    prefix: '.rsc-rsbuild-preview-server-',
    files: { ...rscAppFiles, ...options.files },
    symlinks: workspacePackageLinks([
      '@tanstack/react-start',
      '@tanstack/react-start-rsc',
    ]),
  })
  const reported: Array<ChannelDiagnostic> = []
  /** The compilations' errors and warnings (a silent Rsbuild prints none). */
  const compileErrors: Array<string> = []
  const compileWarnings: Array<string> = []
  /** The compiles of a watch mode build (`watchWith`). */
  const compiles = trackCompiles()
  const compileErrorsPlugin = {
    name: 'rsc-preview-harness:compile-errors',
    setup(api: {
      onAfterCreateCompiler: (
        callback: (params: {
          compiler: Parameters<typeof compiles.track>[0]
        }) => void,
      ) => void
      onAfterBuild: (callback: () => void) => void
      onAfterEnvironmentCompile: (
        callback: (params: {
          stats?: {
            toJson: (options: object) => {
              errors?: Array<{ message: string }>
              warnings?: Array<{ message: string }>
            }
          }
        }) => void,
      ) => void
    }) {
      api.onAfterEnvironmentCompile(({ stats }) => {
        const json = stats?.toJson({ all: false, errors: true, warnings: true })
        for (const error of json?.errors ?? []) {
          compileErrors.push(error.message)
        }
        for (const warning of json?.warnings ?? []) {
          compileWarnings.push(warning.message)
        }
      })
      api.onAfterCreateCompiler(({ compiler }) => compiles.track(compiler))
      api.onAfterBuild(() => compiles.done())
    },
  }
  const cwd = process.cwd()
  // In the app's directory, as `rsbuild build` and `rsbuild preview` run
  process.chdir(app.root)
  try {
    // The app's `rsbuild.config.ts`, for `rsbuild build` and then for
    // `rsbuild preview` (each command configures the app anew)
    const rsbuild = () =>
      createRsbuild({
        cwd: app.root,
        rsbuildConfig: {
          logLevel: 'silent',
          plugins: [
            pluginReact(),
            tanstackStart({
              ...options.start,
              rsc: { enabled: true },
            }) as never,
            compileErrorsPlugin as never,
          ],
          // Start serves the pages, not an HTML template
          tools: { ...options.tools, htmlPlugin: false },
          performance: options.performance,
          server: { host: '127.0.0.1' },
          // Absolute: Start's preview middleware imports the server build
          // from the output directory, which it resolves against the
          // process's working directory when the first request comes
          output: { distPath: { root: path.join(app.root, 'dist') } },
        },
      })
    await withBuildEnvironment('production', reported, async () => {
      const instance = await rsbuild()
      if (options.watchWith) {
        const watching = await instance.build({ watch: true })
        try {
          await compiles.first(watchTimeout)
          // (what the rebuild of the edit reports)
          compileErrors.length = 0
          compileWarnings.length = 0
          await compiles.edit(app.root, options.watchWith, watchTimeout)
          if (compileErrors.length > 0) {
            throw new Error('the rebuild failed')
          }
        } finally {
          await watching.close()
        }
        return
      }
      const built = await instance.build()
      await built.close()
      if (options.rebuildWith) {
        for (const [file, content] of Object.entries(options.rebuildWith)) {
          await writeFile(path.join(app.root, file), content)
        }
        const rebuilt = await instance.build()
        await rebuilt.close()
      }
      if (options.buildAgainWith) {
        for (const [file, content] of Object.entries(options.buildAgainWith)) {
          await writeFile(path.join(app.root, file), content)
        }
        const again = await (await rsbuild()).build()
        await again.close()
      }
    }).catch((error: unknown) => {
      // Rsbuild's error says only that the build failed: the errors are
      // its compilations' and what it reported meanwhile
      throw new AggregateError(
        [
          ...compileErrors,
          ...reported
            .filter(({ severity }) => severity === 'error')
            .map(({ text }) => text),
        ],
        error instanceof Error ? error.message : String(error),
        { cause: error },
      )
    })
    options.signal?.throwIfAborted()
    const {
      result: { server, urls },
      release: releaseNodeEnv,
    } = await holdNodeEnv('production', async () =>
      (await rsbuild()).preview({ getPortSilently: true }),
    )
    const close = async () => {
      try {
        await server.close()
      } finally {
        releaseNodeEnv()
      }
    }
    const url = urls[0]
    if (!url) {
      await close()
      throw new Error('the preview server does not listen')
    }
    return {
      root: app.root,
      url,
      messages: [...reported.map(({ text }) => text), ...compileWarnings],
      errors: reported
        .filter(({ severity }) => severity === 'error')
        .map(({ text }) => text),
      close,
    }
  } finally {
    process.chdir(cwd)
  }
}

/** What `startRscRsbuildPreviewServer` takes. */
export interface RscRsbuildBuildOptions {
  files: Record<string, string>
  start?: Record<string, unknown>
  /** Rsbuild's `tools` (the harness's `htmlPlugin: false` stays). */
  tools?: Record<string, unknown>
  signal?: AbortSignal
  /**
   * Files written after a first build, which a second `build()` of the
   * same Rsbuild instance (the same plugins) then builds: the build served
   * is the second.
   */
  rebuildWith?: Record<string, string>
  /**
   * Builds in watch mode (`rsbuild build --watch`) and writes these files
   * once the first build is done: the build served is the rebuild of the
   * edit (its errors reject).
   */
  watchWith?: Record<string, string>
  /**
   * Files written after a first build, then `rsbuild build` runs again (a
   * new Rsbuild instance and new plugins, what the first build left in the
   * directory kept, e.g. its persistent cache): the build served is the
   * second.
   */
  buildAgainWith?: Record<string, string>
  /** Rsbuild's `performance` (e.g. `{ buildCache: true }`). */
  performance?: Record<string, unknown>
}

export interface RscRsbuildDevServerOptions extends Omit<
  RsbuildDevServerOptions,
  'dir' | 'parent' | 'plugins' | 'entry' | 'registerCleanup'
> {
  /** Start's plugin options (`tanstackStart(options)`), `rsc` enabled. */
  start?: Record<string, unknown>
  /**
   * Runs the server with the app root as the working directory, as
   * `rsbuild dev` in the app does (default `true`). With `false`, the test
   * process's directory stays (`rsbuild dev --root <app>` from elsewhere).
   */
  inAppDirectory?: boolean
}

/**
 * Starts an Rsbuild dev server on a React Start app with RSC enabled, of
 * `files` over `rscAppFiles`, with the built `@tanstack/react-start/plugin/
 * rsbuild` (Start's client and SSR environments, its default entries, the
 * RSC layer and `react-server-dom-rspack`) and `@rsbuild/plugin-react`, as
 * an Rsbuild React app lists them (unless `config.plugins` has it, e.g.
 * with other options). With `browser`, Start's own dev middleware serves
 * the pages (SSR) and Rsbuild's HMR client runs in the page. Its `close()`
 * also closes the server its last `restart()` started.
 */
export async function startRscRsbuildDevServer(
  parent: string,
  options: RscRsbuildDevServerOptions,
): Promise<RsbuildDevServer> {
  const {
    files,
    start,
    config,
    inAppDirectory = true,
    ...devServerOptions
  } = options
  const tanstackStart = await tanstackStartPlugin(parent, 'rsbuild')
  const cwd = process.cwd()
  /** The close of the server the last `restart()` started. */
  let closeLatest = () => Promise.resolve()
  /** In the test process's directory again once `open()` resolved. */
  const inTestDirectory = async (
    open: () => Promise<RsbuildDevServer>,
  ): Promise<RsbuildDevServer> => {
    try {
      const server = await open()
      const { restart } = server
      closeLatest = server.close
      // `rsbuild dev` run again in the app: new plugin instances (`plugins`
      // is called again), the directory's caches kept
      return Object.assign(server, {
        restart: () => inTestDirectory(restart),
      })
    } finally {
      process.chdir(cwd)
    }
  }
  const server = await inTestDirectory(() =>
    createRsbuildDevServer({
      dir: harnessDir,
      parent,
      prefix: '.rsc-rsbuild-dev-server-',
      ...devServerOptions,
      // Start's plugin defines the entries of its environments (the harness
      // default is overridden by its client entry of the same name).
      entry: 'src/router.tsx',
      files: { ...rscAppFiles, ...files },
      symlinks: {
        ...workspacePackageLinks([
          '@tanstack/react-start',
          '@tanstack/react-start-rsc',
        ]),
        ...devServerOptions.symlinks,
      },
      config: {
        ...config,
        tools: {
          // Start serves the pages, not an HTML template
          htmlPlugin: false,
          ...config?.tools,
        },
      },
      plugins: () => [
        ...(pluginNames(config?.plugins).includes('rsbuild:react')
          ? []
          : [pluginReact()]),
        {
          name: 'rsc-app:working-directory',
          setup(api) {
            if (inAppDirectory) {
              process.chdir(api.context.rootPath)
            }
          },
        },
        tanstackStart({ ...start, rsc: { enabled: true } }) as never,
      ],
    }),
  )
  const { close } = server
  return Object.assign(server, {
    close: () => Promise.all([close(), closeLatest()]).then(() => {}),
  })
}

/** The HTTP requests of a page in flight, and when that last changed. */
interface Network {
  pending: Set<unknown>
  changed: number
}

const networks = new WeakMap<Page, Network>()

/**
 * Opens `pathname` of a server (a dev server with `browser`, a preview) in
 * `page` (the `openRscPage` fixture: the test's page). The page's requests
 * from its first open on are tracked for `settledValue`.
 */
export async function openRscPage(
  page: Page,
  server: { url?: string },
  pathname: string,
): Promise<Page> {
  if (!server.url) {
    throw new Error('the dev server does not listen: start it with `browser`')
  }
  if (!networks.has(page)) {
    const network: Network = { pending: new Set(), changed: Date.now() }
    page.on('request', (request) => {
      network.pending.add(request)
      network.changed = Date.now()
    })
    const done = (request: unknown) => {
      if (network.pending.delete(request)) {
        network.changed = Date.now()
      }
    }
    page.on('requestfinished', done)
    page.on('requestfailed', done)
    networks.set(page, network)
  }
  await page.goto(new URL(pathname, server.url).href)
  return page
}

/**
 * Reads `read()` until `accept` takes its value, or until the page's
 * network has settled (no request in flight for `quiet` ms, default 500)
 * and one more read still does not: then whatever the page will show
 * without another request, e.g. a stylesheet that never arrives. Gives up
 * after `timeout` ms (default 15 000). Gives the last value read; the test
 * asserts on it. For pages of `openRscPage`.
 */
export async function settledValue<T>(
  page: Page,
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  { quiet = 500, timeout = 15_000 } = {},
): Promise<T> {
  const network = networks.get(page)
  if (!network) {
    throw new Error('settledValue needs a page of openRscPage')
  }
  const deadline = Date.now() + timeout
  for (;;) {
    const settled =
      network.pending.size === 0 && Date.now() - network.changed >= quiet
    let value: T | undefined
    let readable = true
    try {
      value = await read()
    } catch (error) {
      // The page is (re)loading
      readable = false
      if (Date.now() > deadline) {
        throw error
      }
    }
    if (readable && (accept(value as T) || settled || Date.now() > deadline)) {
      return value as T
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/**
 * The text of `selector` once `answered` takes it (the outcome of a click
 * that sends a request), read as `settledValue` reads it. A click that got
 * no answer by the time the network settled throws a plain error: a broken
 * test, not the value under test, so a known-bug pin does not read it as
 * its bug (`pins-setup.ts`).
 */
export async function answeredText(
  page: Page,
  selector: string,
  answered: (text: string) => boolean,
): Promise<string> {
  const text = await settledValue(
    page,
    async () => (await page.locator(selector).first().textContent()) ?? '',
    answered,
  )
  if (!answered(text)) {
    throw new Error(`${selector}: the click got no answer (${text})`)
  }
  return text
}

/**
 * Waits until the app hydrated in the page (the root route of `rscAppFiles`
 * shows it through the router's `useHydrated()`): only then does the page
 * run the client, e.g. its HMR listeners.
 */
export function waitForHydration(page: Page): Promise<void> {
  return page
    .locator('[data-testid=hydrated]', { hasText: /^hydrated$/ })
    .waitFor()
}

/** What Seroval's string literals escape, by the text after the backslash. */
const stringEscapes: Record<string, string | undefined> = {
  n: '\n',
  r: '\r',
  b: '\b',
  t: '\t',
  f: '\f',
  x3C: '<',
  u2028: ' ',
  u2029: ' ',
}

/**
 * The text of each RSC stream a server-rendered page carries, decoded as
 * the client decodes it. Start serializes a stream as Seroval records
 * `$R[id].next("…")`, one per chunk React Flight wrote (4096 bytes at
 * most), each a string literal of `'t' + text` or `'b' + base64`
 * (router-core's `rawStreamCodec.ts`). A word of the stream can straddle
 * two records, where its offset depends on the checkout's path (React's
 * development stacks name it): search the decoded text, not the HTML.
 */
export function rscStreams(html: string): Array<string> {
  const streams = new Map<string, Array<Buffer>>()
  for (const [, id, literal] of html.matchAll(
    /\$R\[(\d+)\]\.next\("((?:[^"\\]|\\.)*)"\)/g,
  )) {
    const value = literal!.replace(
      /\\(x3C|u2028|u2029|[\s\S])/g,
      (_, escaped: string) => stringEscapes[escaped] ?? escaped,
    )
    if (value[0] !== 't' && value[0] !== 'b') {
      throw new Error(`$R[${id}]: not an encoded chunk: ${value.slice(0, 40)}`)
    }
    const chunk = Buffer.from(
      value.slice(1),
      value[0] === 't' ? 'utf8' : 'base64',
    )
    streams.set(id!, [...(streams.get(id!) ?? []), chunk])
  }
  return [...streams.values()].map((chunks) =>
    Buffer.concat(chunks).toString('utf8'),
  )
}

/**
 * Waits until Start's development-only stylesheet of the server-rendered
 * page (`/@tanstack-start/styles.css`, which prevents a flash of unstyled
 * content before hydration and which the client removes once it hydrated)
 * is gone, so that the computed styles come from what the client loaded.
 */
export async function devStylesGone(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document.querySelector('link[href*="/@tanstack-start/styles.css"]') ===
      null,
    undefined,
    { timeout: 15_000 },
  )
}

/**
 * The computed value of a CSS `property` of the first element matching
 * `selector` in the page, as the browser resolves it (colours as
 * `rgb(r, g, b)`).
 */
export function computedStyle(
  page: Page,
  selector: string,
  property: string,
): Promise<string> {
  return page
    .locator(selector)
    .first()
    .evaluate(
      (element, name) => getComputedStyle(element).getPropertyValue(name),
      property,
    )
}

/**
 * Waits until the computed `property` of `selector` is `expected`, for at
 * most `timeout` ms (default 15 000): a hot update applies asynchronously.
 */
export async function waitForStyle(
  page: Page,
  selector: string,
  property: string,
  expected: string,
  timeout = 15_000,
): Promise<void> {
  await expect
    .poll(() => computedStyle(page, selector, property), { timeout })
    .toBe(expected)
}
