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
 * The runtime packages are stand-ins written into the app
 * (`startRuntimeFiles`, and `routerRuntimeFiles` for apps with routes):
 * server functions run their handler, SSR callers go through the generated
 * server fn resolver, client RPCs throw when called, server builds keep
 * middleware as written. The app's entries are the harness's: the client and
 * server entries Start builds import `#tanstack-start-entry` (`src/start.ts`
 * when the app has one), `#tanstack-router-entry` (`src/router.ts`, a stub
 * unless the app has one) and the test's entry module, whose exports `run()`
 * gives the script as `entry`.
 *
 * Import protection is on, with Start's defaults unless the test configures
 * it; it checks the modules of the source directory (`src`) only.
 */
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
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'
import type { Plugin } from 'vite'

const startPackage = 'node_modules/@tanstack/react-start'

/**
 * Export targets under the `import` condition, the shape of the real
 * package's exports.
 */
function importExports(targets: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(targets).map(([subpath, file]) => [
      subpath,
      { import: { default: file } },
    ]),
  )
}

/** The stand-in `@tanstack/react-start` package. */
export const startRuntimeFiles: Record<string, string> = {
  [`${startPackage}/package.json`]: JSON.stringify({
    name: '@tanstack/react-start',
    type: 'module',
    sideEffects: false,
    exports: importExports({
      '.': './index.js',
      './client-rpc': './client-rpc.js',
      './server-rpc': './server-rpc.js',
      './ssr-rpc': './ssr-rpc.js',
      './server': './server.js',
      './server-only': './marker.js',
      './client-only': './marker.js',
    }),
  }),
  [`${startPackage}/index.js`]: `const uncompiled = (name) => () => {
  throw new Error('uncompiled Start factory: ' + name)
}
export function createServerFn() {
  const builder = {
    middleware: () => builder,
    inputValidator: () => builder,
    handler(rpc, impl) {
      if (!impl) {
        return rpc
      }
      // Like the real runtime, the server fn carries what the extracted fn
      // carries (its id).
      const serverFn = Object.assign((opts) => impl(opts ?? {}), rpc)
      serverFn.__executeServer = (opts) => impl(opts ?? {})
      return serverFn
    },
  }
  return builder
}
export const createServerOnlyFn = uncompiled('createServerOnlyFn')
export const createClientOnlyFn = uncompiled('createClientOnlyFn')
export const createIsomorphicFn = uncompiled('createIsomorphicFn')
// Server builds keep middleware as written: \`options\` holds what each
// method of the chain received.
export function createMiddleware(options) {
  const state = { ...options }
  const builder = { options: state }
  for (const method of ['middleware', 'validator', 'client', 'server']) {
    builder[method] = (value) => {
      state[method] = value
      return builder
    }
  }
  return builder
}
export const createStart = (getOptions) => ({ getOptions })
`,
  [`${startPackage}/client-rpc.js`]: `export const createClientRpc = (id) =>
  Object.assign(
    () => {
      throw new Error('client RPC ' + id)
    },
    { functionId: id },
  )
`,
  [`${startPackage}/server-rpc.js`]: `export const createServerRpc = (meta, fn) =>
  Object.assign(fn, { meta, functionId: meta.id })
`,
  [`${startPackage}/server.js`]: `export const getRequest = () => ({ url: '/' })
`,
  [`${startPackage}/marker.js`]: `export {}
`,
  [`${startPackage}/ssr-rpc.js`]: `import { getServerFnById } from '#tanstack-start-server-fn-resolver'
export const createSsrRpc = (id) =>
  Object.assign(
    async (opts) => (await getServerFnById(id, { origin: 'server' }))(opts ?? {}),
    { functionId: id },
  )
`,
}

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
      ...startRuntimeFiles,
      ...harnessFiles(entries),
      ...(bundler === 'rsbuild' && testLoaderFiles),
      ...files,
    },
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
  return { client: await describe('client'), ssr: await describe('ssr') }
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
}

type Outputs = Record<Env, { outDir: string; chunks: Array<EmittedChunk> }>

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
  const { createBuilder } = await import('vite')
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
  try {
    const builder = await createBuilder({
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
    })
    await builder.buildApp()
  } catch (error) {
    throw new BuildError(
      'vite',
      [...errors, error instanceof Error ? error.message : String(error)].map(
        stripAnsi,
      ),
      warnings.client,
    )
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
  /** Records what each environment emitted. */
  const outputPlugin: RsbuildPlugin = {
    name: 'start-build-harness:outputs',
    setup(api) {
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
        }
      })
    },
  }
  try {
    const rsbuild = await createRsbuild({
      cwd: target.root,
      loadEnv: false,
      rsbuildConfig: mergeRsbuildConfig({
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
      }, target.rsbuildConfig ?? {}),
    })
    await rsbuild.build()
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

function checkOutputs(outputs: Partial<Outputs>): Outputs {
  if (!outputs.client || !outputs.ssr) {
    throw new Error(
      `expected client and SSR outputs, got ${Object.keys(outputs).join(', ') || 'none'}`,
    )
  }
  return outputs as Outputs
}
