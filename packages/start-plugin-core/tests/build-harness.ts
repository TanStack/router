/**
 * Real-build harness for Start goal tests whose outcome the bundler decides
 * (e.g. "server code never reaches the client bundle"). Builds an app the
 * way `vite build` or `rsbuild build` builds a React Start app: through
 * Start's own Vite or Rsbuild plugin (`tanStackStartVite` /
 * `tanStackStartRsbuild` with the options `@tanstack/react-start` passes),
 * so its environments (client, then SSR, which is the server fn provider),
 * the Start compiler, import protection, the router generator and code
 * splitter, and the generated server fn resolver are Start's. The output of
 * each environment is described and run with the shared build harness
 * (`@tanstack/compiler-test-utils/build-harness`). The temporary apps live
 * in this directory.
 *
 * `@tanstack/react-start` is the real package (`startRuntimeLinks`): both
 * builds bundle and run Start's runtime. What the test process cannot do is
 * stood in for, each checked against the real runtime in
 * build-harness.test.ts: SSR scripts run in a request context
 * (`inRequestContext`), and a client script observes the requests a server
 * fn call sends (`requestsOfPrelude`). An SSR script calls a server fn by id
 * through Start's own server entry and client RPC (`callByIdPrelude`).
 * `@tanstack/react-router` is a stand-in for apps with routes
 * (`routerRuntimeFiles`). The app's entries are the harness's: the client
 * and server entries Start builds import `#tanstack-start-entry`
 * (`src/start.ts` when the app has one), `#tanstack-router-entry`
 * (`src/router.ts`, a stub unless the app has one) and the test's entry
 * module, whose exports `run()` gives the script as `entry`. Vite builds run
 * in the app's directory, as `vite build` does.
 *
 * Import protection is on, with Start's defaults unless the test configures
 * it; it checks the modules of the source directory (`src`) only.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { existsSync } from 'node:fs'
import { mkdir, symlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BuildError,
  chunksOfBundle,
  chunksOfStats,
  createApp,
  describeBuild,
  statsMessages,
  statsOptions,
  stripAnsi,
  withBuildEnvironment,
} from '@tanstack/compiler-test-utils/build-harness'
import { trackCompiles } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { onTestFinished } from 'vitest'
import { tanStackStartVite } from '../src/vite/plugin'
import { tanStackStartRsbuild } from '../src/rsbuild/plugin'
import { testLoaderFiles, useTestLoaders } from './rsbuild-test-loaders'
import type {
  BuildMode,
  BuildResult,
  EmittedChunk,
  StatsJson,
} from '@tanstack/compiler-test-utils/build-harness'
import type { TanStackStartInputConfig } from '../src/schema'
import type { StartCompilerImportTransform } from '../src/types'
// The type of the real context (`@tanstack/start-storage-context` is no
// dependency of this package).
import type { StartStorageContext } from '../../start-storage-context/src/async-local-storage'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'
import type { InlineConfig, Plugin } from 'vite'

/**
 * The workspace's `@tanstack/react-start` package. Its build (`dist`) is
 * what apps link: the `test:unit` target depends on its `build` target.
 */
export const reactStartPackage = fileURLToPath(
  new URL('../../react-start', import.meta.url),
)

/**
 * Links (`AppOptions.symlinks`) that give an app Start's real runtime:
 * `node_modules/@tanstack/react-start` is the workspace package, so the app
 * bundles and runs the built package with its own export conditions. Its
 * dependencies (`@tanstack/start-client-core`, `@tanstack/start-server-core`,
 * ...) resolve from its real path, as in an installed app. An app whose
 * `files` bring their own `@tanstack/react-start` (hydrate-build.test.ts:
 * `<Hydrate>` rendered by a stand-in React) keeps it.
 */
export function startRuntimeLinks(
  files: Record<string, string> = {},
): Record<string, string> {
  if ('node_modules/@tanstack/react-start/package.json' in files) {
    return {}
  }
  if (!existsSync(path.join(reactStartPackage, 'dist/esm/index.js'))) {
    throw new Error(
      `@tanstack/react-start is not built (no ${reactStartPackage}/dist): run the tests through Nx, whose test:unit target builds it first`,
    )
  }
  return { 'node_modules/@tanstack/react-start': reactStartPackage }
}

/** Creates the `startRuntimeLinks()` of an app made without `createApp`. */
export async function linkStartRuntime(root: string) {
  for (const [link, target] of Object.entries(startRuntimeLinks())) {
    await mkdir(path.dirname(path.join(root, link)), { recursive: true })
    await symlink(target, path.join(root, link))
  }
}

/**
 * The request context (`StartStorageContext` of
 * `@tanstack/start-storage-context`) the harness runs server code in: a
 * request to `/` that ran no request middleware, with default start
 * options, like Start's request handler opens for an app without
 * `createStart`. It is the one piece of Start the harness stands in for: a
 * test calls server code outside any request. Self-contained: SSR scripts
 * run its source (`inRequestContext`). Checked against the real runtime in
 * build-harness.test.ts.
 */
function testRequestContext(): StartStorageContext {
  return {
    request: new Request('http://localhost/'),
    startOptions: {},
    contextAfterGlobalMiddlewares: {},
    executedRequestMiddlewares: new Set(),
    handlerType: 'router',
    getRouter: () => {
      throw new Error('no router in the test request context')
    },
  }
}

/** Key of the storage of `@tanstack/start-storage-context`. */
const startStorageKey = `Symbol.for('tanstack-start:start-storage-context')`

/**
 * Wraps a script of the SSR build's `run()` in the test request context
 * (`testRequestContext`), opened like Start's request handler does
 * (`runWithStartContext`: `run()` of the storage that the app's bundled
 * `@tanstack/start-storage-context` shares on `globalThis`).
 */
export const inRequestContext = (script: string) =>
  `const storage = globalThis[${startStorageKey}]
const script = async () => {
${script}
}
if (!storage) {
  return await script()
}
return await storage.run((${testRequestContext.toString()})(), script)`

/**
 * Runs `fn` in the test request context (`testRequestContext`), for server
 * code a test imports from a build output in its own process.
 */
export function runInRequestContext<T>(fn: () => T): T {
  const global = globalThis as unknown as Record<
    symbol,
    AsyncLocalStorage<unknown> | undefined
  >
  const storage = (global[
    Symbol.for('tanstack-start:start-storage-context')
  ] ??= new AsyncLocalStorage())
  return storage.run(testRequestContext(), fn)
}

/**
 * Exports of an SSR entry whose script calls server fns by id
 * (`callByIdPrelude`): Start's default server entry (the HTTP handler of a
 * Start app) and Start's client RPC. The server entry renders with the real
 * `@tanstack/react-router`: an app with the stand-in (`routerRuntimeFiles`)
 * cannot load it.
 */
export const callByIdExports = `export { default as startServerEntry } from '@tanstack/react-start/server-entry'
export { createClientRpc } from '@tanstack/react-start/client-rpc'
`

/**
 * Prelude of an SSR script whose entry has `callByIdExports`:
 * `callById(id, data)` sends the GET request of a client call of the server
 * fn `id` (Start's client RPC) to Start's server entry, as a page of the
 * same origin does (the browser adds `Sec-Fetch-Site`, which Start's CSRF
 * middleware checks), and gives the decoded result or throws the decoded
 * error, like the client's server fn.
 */
export const callByIdPrelude = `const callById = async (id, data) => {
  const fetch = (url, init) => {
    const headers = new Headers(init.headers)
    headers.set('sec-fetch-site', 'same-origin')
    return entry.startServerEntry.fetch(
      new Request(new URL(url, 'http://localhost'), { ...init, headers }),
    )
  }
  const reply = await entry.createClientRpc(id)({ data, method: 'GET', fetch })
  if ('error' in reply) {
    throw reply.error
  }
  return reply.result
}
`

/**
 * Calls the client's server fn `fn` (with `options`, e.g. its `data`) and
 * gives the requests it sends. A test's client has no server: the call's
 * `fetch` option (Start's public API) records each request and fails it.
 * Self-contained: client scripts run its source (`requestsOfPrelude`).
 */
export async function requestsOf(
  fn: (options: Record<string, unknown>) => Promise<unknown>,
  options: Record<string, unknown> = {},
): Promise<Array<{ url: string; method: string | undefined }>> {
  const requests: Array<{ url: string; method: string | undefined }> = []
  const fetch = (url: string | URL, init?: RequestInit) => {
    requests.push({ url: String(url), method: init?.method })
    return Promise.reject(new Error('no server in the client run'))
  }
  await fn({ ...options, fetch }).catch(() => {})
  return requests
}

/** Prelude of a client script: `requestsOf(fn, options)` (see above). */
export const requestsOfPrelude = `const requestsOf = ${requestsOf.toString()}
`

const routerPackage = 'node_modules/@tanstack/react-router'

/**
 * A stand-in `@tanstack/react-router` for apps with routes: a route is its
 * options (`Route.options`), split options load their chunk when called,
 * and the generated route tree links routes as children.
 */
export const routerRuntimeFiles: Record<string, string> = {
  [`${routerPackage}/package.json`]: JSON.stringify({
    name: '@tanstack/react-router',
    type: 'module',
    sideEffects: false,
    exports: { '.': './index.js' },
  }),
  [`${routerPackage}/index.js`]: `function createRouteObject(options) {
  const route = {
    options,
    children: undefined,
    update(extra) {
      Object.assign(route.options, extra)
      return route
    },
    _addFileChildren(children) {
      route.children = children
      return route
    },
    _addFileTypes: () => route,
  }
  return route
}
export const createRootRoute = (options = {}) => createRouteObject(options)
export const createFileRoute = () => (options = {}) => createRouteObject(options)
export const lazyFn = (load, name) => async (...args) => (await load())[name](...args)
export const lazyRouteComponent = (load, name = 'default') => {
  let loaded
  const Lazy = (props) => {
    if (!loaded) throw new Error('lazy component rendered before it loaded')
    return loaded(props)
  }
  Lazy.preload = async () => {
    loaded = (await load())[name]
  }
  return Lazy
}
`,
}

export type StartBundler = 'vite' | 'rsbuild'

/** Every bundler Start has a plugin for. */
export const startBundlers: ReadonlyArray<StartBundler> = ['vite', 'rsbuild']

export interface StartBuildOptions {
  /** Default `vite`. */
  bundler?: StartBundler
  /** App files by path relative to the app root. */
  files: Record<string, string>
  /**
   * The test's entry module of both environments, or of each, relative to
   * the app root (default `entry.ts`).
   */
  entry?: string | { client: string; ssr: string }
  /** The app's `package.json` (see `AppOptions.packageJson`). */
  packageJson?: Record<string, unknown> | null
  /** Shorthand for `packageJson.sideEffects`. */
  sideEffects?: boolean | Array<string>
  mode?: BuildMode
  /** Default `mode === 'production'`. */
  minify?: boolean
  /**
   * Emits a source map for each chunk (`Chunk.map` of both results). Default
   * `false`.
   */
  sourcemap?: boolean
  /** Start's plugin options (`tanstackStart(options)`). */
  start?: TanStackStartInputConfig
  /**
   * External import transforms of the Start compiler, which a framework
   * package passes to Start's plugin (e.g. React's RSC CSS transform).
   */
  compilerTransforms?: Array<StartCompilerImportTransform>
  /**
   * Registers the removal of the app (default: when the current test
   * finishes). A build shared by several tests keeps the cleanup and runs
   * it in `afterAll`.
   */
  registerCleanup?: (cleanup: () => Promise<void>) => void
  /**
   * Builds the app this many times in a row, in the same directory and with
   * a new plugin instance each time (default 1). The results describe the
   * last build, e.g. one Rsbuild restores from its persistent cache
   * (`rsbuildConfig: { performance: { buildCache: true } }`).
   */
  builds?: number
  /** Rsbuild configuration merged over the harness's (Rsbuild builds). */
  rsbuildConfig?: RsbuildConfig
  /**
   * Vite configuration merged over the harness's (Vite builds), e.g. an
   * app's `experimental.bundledDev`, which stays set for `vite build`.
   */
  viteConfig?: InlineConfig
  /**
   * Rsbuild builds: builds in watch mode (`rsbuild build --watch`), applies
   * these app file edits (`null` deletes a file) once the first build is
   * done, and describes the rebuild they cause (its errors reject).
   */
  watchEdits?: Record<string, string | null>
  /**
   * Vite builds: the working directory of the build (default: the app's, as
   * `vite build` run in the app directory).
   */
  cwd?: string
}

export interface StartBuild {
  client: BuildResult
  ssr: BuildResult
}

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** Global the harness entries assign the test entry's exports to. */
const entryGlobal = '__tssBuildHarnessEntry'

/**
 * The client or server entry of the app: imports what Start's default
 * entries import, and the test's entry module.
 */
const harnessEntry = (
  testEntry: string,
) => `import * as start from '#tanstack-start-entry'
import * as router from '#tanstack-router-entry'
import * as entry from ${JSON.stringify(`../${testEntry}`)}
globalThis.__tssBuildHarnessApp = { start, router }
globalThis.${entryGlobal} = entry
`

/** The files the harness adds to every app, unless the app has them. */
const harnessFiles = (entries: { client: string; ssr: string }) => ({
  'harness/client-entry.ts': harnessEntry(entries.client),
  'harness/server-entry.ts': harnessEntry(entries.ssr),
  'harness/start.ts': `export const startInstance = undefined\n`,
  'src/router.ts': `export const getRouter = () => undefined\n`,
  // The router generator needs a routes directory (nothing imports the
  // route tree unless the app's router does).
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
})

/** The core options `@tanstack/react-start` passes to Start's plugin. */
function reactStartCoreOptions(target: BuildTarget) {
  const { root } = target
  return {
    framework: 'react',
    defaultEntryPaths: {
      client: path.join(root, 'harness/client-entry.ts'),
      server: path.join(root, 'harness/server-entry.ts'),
      start: path.join(root, 'harness/start.ts'),
    },
    providerEnvironmentName: 'ssr',
    ssrIsProvider: true,
    compilerTransforms: target.compilerTransforms,
  } as const
}

/**
 * Builds the app with Start's plugin of `bundler` (client, then SSR) and
 * describes the output of each environment. Both results share the build's
 * duration and console messages; warnings are per environment.
 */
export async function buildStart(
  options: StartBuildOptions,
): Promise<StartBuild> {
  const { bundler = 'vite', entry = 'entry.ts', files } = options
  const entries =
    typeof entry === 'object' ? entry : { client: entry, ssr: entry }
  const app = await createApp({
    dir: harnessDir,
    prefix: `.start-build-harness-${bundler}-`,
    registerCleanup: options.registerCleanup ?? onTestFinished,
    packageJson: options.packageJson,
    sideEffects: options.sideEffects,
    files: {
      ...harnessFiles(entries),
      ...(bundler === 'rsbuild' && testLoaderFiles),
      ...files,
    },
    symlinks: startRuntimeLinks(files),
  })
  const mode = options.mode ?? 'production'
  const target: BuildTarget = {
    root: app.root,
    mode,
    minify: options.minify ?? mode === 'production',
    sourcemap: options.sourcemap ?? false,
    start: options.start ?? {},
    compilerTransforms: options.compilerTransforms,
    rsbuildConfig: options.rsbuildConfig,
    viteConfig: options.viteConfig,
    watchEdits: options.watchEdits,
    cwd: options.cwd,
  }
  const warnings = { client: [], ssr: [] } as Record<Env, Array<string>>
  const consoleMessages: Array<string> = []
  let started = performance.now()
  let outputs = await withBuildEnvironment(mode, consoleMessages, () =>
    builders[bundler](target, warnings),
  )
  for (let build = 1; build < (options.builds ?? 1); build++) {
    warnings.client.length = 0
    warnings.ssr.length = 0
    consoleMessages.length = 0
    started = performance.now()
    outputs = await withBuildEnvironment(mode, consoleMessages, () =>
      builders[bundler](target, warnings),
    )
  }
  const duration = performance.now() - started
  const describe = (env: Env) =>
    describeBuild({
      bundler: bundler === 'vite' ? 'vite' : 'rspack',
      env,
      mode,
      minify: target.minify,
      esModules: outputs[env].esModules,
      root: app.root,
      outDir: outputs[env].outDir,
      chunks: outputs[env].chunks,
      sourcemap: target.sourcemap,
      warnings: warnings[env],
      consoleMessages,
      duration,
      dispose: app.dispose,
      entryGlobal,
    })
  const ssr = await describe('ssr')
  return {
    client: await describe('client'),
    ssr: { ...ssr, run: (script = '') => ssr.run(inRequestContext(script)) },
  }
}

type Env = 'client' | 'ssr'

interface BuildTarget {
  root: string
  mode: BuildMode
  minify: boolean
  sourcemap: boolean
  start: TanStackStartInputConfig
  compilerTransforms: Array<StartCompilerImportTransform> | undefined
  rsbuildConfig: RsbuildConfig | undefined
  viteConfig?: InlineConfig
  watchEdits?: Record<string, string | null>
  cwd?: string
}

type Outputs = Record<
  Env,
  {
    outDir: string
    chunks: Array<EmittedChunk>
    /** Whether the chunks are ES modules (Rsbuild's `output.module`). */
    esModules?: boolean
  }
>

const builders: Record<
  StartBundler,
  (
    target: BuildTarget,
    warnings: Record<Env, Array<string>>,
  ) => Promise<Outputs>
> = {
  vite: buildWithVite,
  rsbuild: buildWithRsbuild,
}

async function buildWithVite(
  target: BuildTarget,
  warnings: Record<Env, Array<string>>,
): Promise<Outputs> {
  const { createBuilder, mergeConfig } = await import('vite')
  const outputs: Partial<Outputs> = {}
  const errors: Array<string> = []
  /** Records what each environment emitted. */
  const outputPlugin: Plugin = {
    name: 'start-build-harness:outputs',
    writeBundle(_options, bundle) {
      const env = this.environment.name as Env
      outputs[env] = {
        outDir: path.resolve(target.root, this.environment.config.build.outDir),
        chunks: chunksOfBundle(Object.values(bundle)),
      }
    },
  }
  /** The build options of `env`, which records its bundler warnings. */
  const environmentBuild = (env: Env) => ({
    build: {
      minify: target.minify,
      sourcemap: target.sourcemap,
      emptyOutDir: true,
      target: 'esnext',
      rolldownOptions: {
        onwarn: (warning: { message: string }) => {
          warnings[env].push(stripAnsi(warning.message))
        },
      },
    },
  })
  /** Vite's own warnings do not name the environment. */
  const warnBoth = (message: string) => {
    warnings.client.push(stripAnsi(message))
    warnings.ssr.push(stripAnsi(message))
  }
  // `vite build` runs in the app's directory: Start's plugin reads the
  // dependencies of the working directory's package.json (Start libraries
  // it bundles in SSR, `crawlFrameworkPkgs`).
  const cwd = process.cwd()
  process.chdir(target.cwd ?? target.root)
  try {
    const builder = await createBuilder(
      mergeConfig<InlineConfig, InlineConfig>(
        {
          root: target.root,
          configFile: false,
          envDir: false,
          publicDir: false,
          mode: target.mode,
          logLevel: 'warn',
          customLogger: {
            info: () => {},
            warn: warnBoth,
            warnOnce: warnBoth,
            error: (message) => {
              if (!/Build failed in/.test(message)) {
                errors.push(message)
              }
            },
            clearScreen: () => {},
            hasErrorLogged: () => false,
            hasWarned: false,
          },
          environments: {
            client: environmentBuild('client'),
            ssr: environmentBuild('ssr'),
          },
          plugins: [
            tanStackStartVite(
              {
                ...reactStartCoreOptions(target),
                ssrResolverStrategy: { type: 'default' },
              },
              target.start,
            ),
            outputPlugin,
          ],
        },
        target.viteConfig ?? {},
      ),
    )
    await builder.buildApp()
  } catch (error) {
    throw new BuildError(
      'vite',
      [...errors, error instanceof Error ? error.message : String(error)].map(
        stripAnsi,
      ),
      warnings.client,
    )
  } finally {
    process.chdir(cwd)
  }
  return checkOutputs(outputs)
}

async function buildWithRsbuild(
  target: BuildTarget,
  warnings: Record<Env, Array<string>>,
): Promise<Outputs> {
  const { createRsbuild, mergeRsbuildConfig } = await import('@rsbuild/core')
  const outputs: Partial<Outputs> = {}
  const errors: Array<string> = []
  /** The compiles of a watch mode build. */
  const compiles = trackCompiles()
  /** Records what each environment emitted. */
  const outputPlugin: RsbuildPlugin = {
    name: 'start-build-harness:outputs',
    setup(api) {
      api.onAfterCreateCompiler(({ compiler }) => {
        compiles.track(compiler)
      })
      api.onAfterBuild(() => {
        compiles.done()
      })
      api.onAfterEnvironmentCompile(({ stats, environment }) => {
        const env = environment.name as Env
        if (!stats) {
          errors.push(`[${env}] no compilation stats`)
          return
        }
        const json = stats.toJson(statsOptions) as StatsJson
        warnings[env].push(...statsMessages(json.warnings))
        errors.push(
          ...statsMessages(json.errors).map((message) => `[${env}] ${message}`),
        )
        outputs[env] = {
          outDir: environment.distPath,
          chunks: chunksOfStats(json, { entry: 'index', extension: '.js' }),
          esModules: environment.config.output.module,
        }
      })
    },
  }
  try {
    const rsbuild = await createRsbuild({
      cwd: target.root,
      loadEnv: false,
      rsbuildConfig: mergeRsbuildConfig(
        {
          root: target.root,
          mode: target.mode,
          logLevel: 'silent',
          output: {
            minify: target.minify,
            sourceMap: target.sourcemap ? { js: 'source-map' } : false,
            cleanDistPath: true,
          },
          // React's JSX runtime, as `pluginReact()` of a React Start app
          // configures it.
          tools: {
            swc: {
              jsc: {
                transform: {
                  react: {
                    runtime: 'automatic',
                    development: target.mode === 'development',
                  },
                },
              },
            },
          },
          plugins: [
            tanStackStartRsbuild(reactStartCoreOptions(target), target.start),
            useTestLoaders(target.root),
            outputPlugin,
          ],
        },
        target.rsbuildConfig ?? {},
      ),
    })
    if (target.watchEdits) {
      const watching = await rsbuild.build({ watch: true })
      try {
        await compiles.first(watchTimeout)
        errors.length = 0
        warnings.client.length = 0
        warnings.ssr.length = 0
        await compiles.edit(target.root, target.watchEdits, watchTimeout)
      } finally {
        await watching?.close()
      }
    } else {
      await rsbuild.build()
    }
  } catch (error) {
    throw new BuildError(
      'rspack',
      errors.length
        ? errors
        : [error instanceof Error ? error.message : String(error)],
      warnings.client,
    )
  }
  if (errors.length) {
    throw new BuildError('rspack', errors, warnings.client)
  }
  return checkOutputs(outputs)
}

/**
 * How long a watch mode build waits for a compile: only a guard against a
 * compile that never comes (see `trackCompiles`).
 */
const watchTimeout = 20_000

function checkOutputs(outputs: Partial<Outputs>): Outputs {
  if (!outputs.client || !outputs.ssr) {
    throw new Error(
      `expected client and SSR outputs, got ${Object.keys(outputs).join(', ') || 'none'}`,
    )
  }
  return outputs as Outputs
}
