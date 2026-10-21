/**
 * Real-build harness for Start goal tests whose outcome the bundler decides
 * (e.g. "server code never reaches the client bundle"). Builds an app the
 * way `vite build` or `rsbuild build` builds a React Start app: through
 * Start's own Vite or Rsbuild plugin, the BUILT public entries of this
 * package (`@tanstack/start-plugin-core/vite`, `/rsbuild`, with the options
 * `@tanstack/react-start` passes; the `test:integration` target builds the
 * package first), so its environments (client, then SSR, which is the server
 * fn provider), the Start compiler, import protection, the router generator
 * and code splitter, and the generated server fn resolver are Start's, and
 * Rspack loads Start's loaders from the package as in an installed app. The
 * output of each environment is described and run with the shared build
 * harness (`@tanstack/compiler-test-utils/build-harness`). The temporary
 * apps live in this directory.
 *
 * `@tanstack/react-start` is the real package (`startRuntimeLinks`), and
 * `@tanstack/react-router` the real one too (a dependency of this package,
 * which the apps resolve like any dependency): both builds bundle and run
 * Start's runtime and the router. What the test process cannot do is stood
 * in for, each checked against the real runtime in the harness controls
 * (`outside-compiler-corpus/build-harness.test.ts`): SSR scripts run in a
 * request context opened with the public `runWithStartContext` of
 * `@tanstack/start-storage-context` (`inRequestContext`), and a client
 * script observes the requests a server fn call sends (`requestsOfPrelude`).
 * An SSR script calls a server fn by id through Start's own server entry and
 * client RPC (`callByIdPrelude`). The app's entries are the harness's: the
 * client and server entries Start builds import the app's documented router
 * entry (`src/router.ts`, a stub unless the app has one), its start entry
 * (`src/start.ts` when the app has one) and the test's entry module, whose
 * exports `run()` gives the script as `entry`. Vite builds run in the app's
 * directory, as `vite build` does.
 *
 * Everything a build reports, on every channel (the bundler's warnings and
 * errors, Vite's logger, `console.*` and the process streams; SPEC §5.7),
 * is in `StartBuild.diagnostics`, and a failed build rejects with a
 * `StartBuildError` carrying the same (`diagnostics`).
 *
 * Import protection is on, with Start's defaults unless the test configures
 * it; it checks the modules of the source directory (`src`) only.
 */
import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { openDiagnosticChannel } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  linkWorkspacePackages,
  workspacePackage,
  workspacePackageLinks,
} from '@tanstack/compiler-test-utils/workspace-packages'
import {
  BuildError,
  chunksOfBundle,
  chunksOfStats,
  createApp,
  describeBuild,
  parsedModules,
  recordParsedModules,
  statsMessages,
  statsOptions,
  stripAnsi,
  withBuildEnvironment,
} from '@tanstack/compiler-test-utils/build-harness'
import { trackCompiles } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { onTestFinished } from 'vitest'
import { tanStackStartVite } from '@tanstack/start-plugin-core/vite'
import { tanStackStartRsbuild } from '@tanstack/start-plugin-core/rsbuild'
import type {
  BuildMode,
  BuildResult,
  EmittedChunk,
  ParsedModules,
  StatsJson,
} from '@tanstack/compiler-test-utils/build-harness'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'
import type {
  StartCompilerImportTransform,
  TanStackStartInputConfig,
} from '../src'
import type { RsbuildConfig, RsbuildPlugin } from '@rsbuild/core'
import type { InlineConfig, Plugin } from 'vite'

/**
 * The workspace's built `@tanstack/react-start` package, which apps link
 * (`startRuntimeLinks`): the `test:integration` target depends on its
 * `build` target, as this package cannot depend on it.
 */
export const reactStartPackage = workspacePackage('@tanstack/react-start')

/**
 * Links (`AppOptions.symlinks`) that give an app Start's real runtime:
 * `node_modules/@tanstack/react-start` is the workspace package
 * (`workspacePackageLinks`), so the app bundles and runs the built package
 * with its own export conditions. Its dependencies
 * (`@tanstack/start-client-core`, `@tanstack/start-server-core`, ...)
 * resolve from its real path, as in an installed app.
 */
export function startRuntimeLinks(): Record<string, string> {
  return workspacePackageLinks(['@tanstack/react-start'])
}

/** Creates the `startRuntimeLinks()` of an app made without `createApp`. */
export function linkStartRuntime(root: string) {
  return linkWorkspacePackages(root, ['@tanstack/react-start'])
}

/**
 * The request context (the first argument of `runWithStartContext` of
 * `@tanstack/start-storage-context`) the harness runs server code in: a
 * request to `/` that ran no request middleware, with default start
 * options, like Start's request handler opens for an app without
 * `createStart`. It is the one piece of Start the harness stands in for: a
 * test calls server code outside any request. Self-contained: SSR scripts
 * run its source (`inRequestContext`). Checked against the real runtime in
 * the harness controls (`outside-compiler-corpus/build-harness.test.ts`).
 */
function testRequestContext() {
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

/**
 * The URL of `@tanstack/start-storage-context`'s public entry (the file its
 * `package.json` exports): the package Start's runtime reads the request
 * context from, whose `runWithStartContext` opens one. Its storage is
 * shared by every copy of the package in a process (it says so), so the
 * copy a script imports opens the context the app's bundled copy reads.
 */
function storageContextUrl(): string {
  const root = workspacePackage('@tanstack/start-storage-context')
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as { exports: Record<string, { import: { default: string } }> }
  return pathToFileURL(path.join(root, manifest.exports['.']!.import.default))
    .href
}

/**
 * Wraps a script of the SSR build's `run()` in the test request context
 * (`testRequestContext`), opened like Start's request handler opens one,
 * with the public `runWithStartContext`.
 */
export const inRequestContext = (script: string) =>
  `const { runWithStartContext } = await import(${JSON.stringify(storageContextUrl())})
const script = async () => {
${script}
}
return await runWithStartContext((${testRequestContext.toString()})(), script)`

/**
 * Runs `fn` in the test request context (`testRequestContext`), for server
 * code a test imports in its own process (e.g. through a dev server's SSR
 * module runner), with the public `runWithStartContext`.
 */
export async function runInRequestContext<T>(fn: () => T): Promise<Awaited<T>> {
  const { runWithStartContext } = (await import(storageContextUrl())) as {
    runWithStartContext: <TResult>(
      context: unknown,
      run: () => TResult,
    ) => TResult
  }
  return await runWithStartContext(testRequestContext(), fn)
}

/**
 * Exports of an SSR entry whose script calls server fns by id
 * (`callByIdPrelude`): Start's default server entry (the HTTP handler of a
 * Start app) and Start's client RPC.
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

export type StartBundler = 'vite' | 'rsbuild'

/** Every bundler Start has a plugin for. */
export const startBundlers: ReadonlyArray<StartBundler> = ['vite', 'rsbuild']

export interface StartBuildOptions {
  /** Default `vite`. */
  bundler?: StartBundler
  /**
   * The Start framework package of the app (default `react`): Start's
   * plugin gets the options that package passes, and `solid` links the
   * built `@tanstack/solid-start` and `@tanstack/solid-router` too (the
   * dependencies of a Solid Start app). The app's JSX plugin (e.g.
   * `vite-plugin-solid`) comes from `viteConfig`.
   */
  framework?: 'react' | 'solid'
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
  /**
   * Symbolic links of the app besides Start's runtime (`startRuntimeLinks`),
   * by path relative to the app root (see `AppOptions.symlinks`), e.g. a
   * workspace package a library of the app depends on, or a package
   * directory of the app linked into its `node_modules`.
   */
  symlinks?: Record<string, string>
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
  /**
   * Directory name prefix of the temporary app (default
   * `.start-build-harness-<bundler>-`), e.g. one with characters a project
   * path may carry.
   */
  prefix?: string
}

export interface StartBuild {
  client: BuildResult
  ssr: BuildResult
  /** App root on disk (paths in reports are relative to it or absolute). */
  root: string
  /**
   * Everything the build reported, on every channel, in order (SPEC §5.7):
   * the bundler's warnings of both environments, Vite's logger, `console.*`
   * and the process streams. A report names its environment (J6.5), which
   * tells the environments apart; `client.warnings`/`ssr.warnings` hold only
   * what each environment's bundler reported.
   */
  diagnostics: Array<ChannelDiagnostic>
  /**
   * Builds the same app again, in the same directory with the same options
   * and a new plugin instance, after writing `edits` (app files by path;
   * `null` deletes one). The output directories are reused: read what this
   * build's results need before rebuilding.
   */
  rebuild: (edits?: Record<string, string | null>) => Promise<StartBuild>
}

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** Global the harness entries assign the test entry's exports to. */
const entryGlobal = '__tssBuildHarnessEntry'

/**
 * The client or server entry of the app: imports the app's documented
 * entries that Start's default entries import (the router entry
 * `src/router.ts` and, when the app has one, the start entry
 * `src/start.ts`; Start's defaults, as no test moves them), and the test's
 * entry module.
 */
const harnessEntry = (
  testEntry: string,
  start: string,
) => `import * as start from ${JSON.stringify(start)}
import * as router from '../src/router'
import * as entry from ${JSON.stringify(`../${testEntry}`)}
globalThis.__tssBuildHarnessApp = { start, router }
globalThis.${entryGlobal} = entry
`

/**
 * `harness/render.ts` of every app: `renderPath(routeTree, pathname)`
 * renders the app's route tree at `pathname` through the real router and
 * React (`createRouter` over the tree, `router.load()`, which runs the
 * loaders and loads the split route options, then `<RouterProvider>` to
 * HTML), and React's `createElement` and `renderToString` render a
 * component on its own (e.g. a loaded split component, whose render error
 * `renderToString` throws). A test's entry re-exports what its scripts use
 * (`export { renderPath } from '../harness/render'`: `entry.renderPath(...)`).
 */
const renderFile = `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

export { createElement, renderToString }

export async function renderPath(
  routeTree: AnyRoute,
  pathname: string,
): Promise<string> {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  await router.load()
  return renderToString(createElement(RouterProvider, { router }))
}
`

/** The files the harness adds to every app, unless the app has them. */
const harnessFiles = (
  entries: { client: string; ssr: string },
  files: Record<string, string>,
) => {
  const start = 'src/start.ts' in files ? '../src/start' : './start'
  return {
    'harness/client-entry.ts': harnessEntry(entries.client, start),
    'harness/server-entry.ts': harnessEntry(entries.ssr, start),
    ...sharedHarnessFiles,
  }
}

const sharedHarnessFiles = {
  'harness/start.ts': `export const startInstance = undefined\n`,
  'harness/render.ts': renderFile,
  'src/router.ts': `export const getRouter = () => undefined\n`,
  // The router generator needs a routes directory (nothing imports the
  // route tree unless the app's router does).
  'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
}

/** The core options `@tanstack/react-start` passes to Start's plugin. */
function reactStartCoreOptions(target: BuildTarget) {
  const { root } = target
  return {
    framework: target.framework,
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
    prefix: options.prefix ?? `.start-build-harness-${bundler}-`,
    registerCleanup: options.registerCleanup ?? onTestFinished,
    packageJson: options.packageJson,
    sideEffects: options.sideEffects,
    files: {
      ...harnessFiles(entries, files),
      ...files,
    },
    symlinks: {
      ...startRuntimeLinks(),
      ...(options.framework === 'solid' &&
        workspacePackageLinks([
          '@tanstack/solid-start',
          '@tanstack/solid-router',
        ])),
      ...options.symlinks,
    },
  })
  const mode = options.mode ?? 'production'
  const target: BuildTarget = {
    root: app.root,
    framework: options.framework ?? 'react',
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
  return buildAt(app, bundler, target, options.builds ?? 1)
}

/**
 * Builds the app at `app.root` `builds` times in a row (a new plugin
 * instance each time) and describes the last build. Its `rebuild` writes
 * edits into the same directory and builds again.
 */
async function buildAt(
  app: Awaited<ReturnType<typeof createApp>>,
  bundler: StartBundler,
  target: BuildTarget,
  builds: number,
): Promise<StartBuild> {
  const { mode } = target
  const warnings = { client: [], ssr: [] } as Record<Env, Array<string>>
  const consoleMessages: Array<string> = []
  let diagnostics: Array<ChannelDiagnostic> = []
  /** One build, recording what it reports on every channel. */
  const build = async () => {
    warnings.client.length = 0
    warnings.ssr.length = 0
    consoleMessages.length = 0
    const channel = openDiagnosticChannel()
    /** What the build described reported (a watch build: the rebuild's). */
    const described = () => channel.since(describedFrom.get(channel) ?? 0)
    try {
      return await withBuildEnvironment(mode, consoleMessages, () =>
        builders[bundler](target, warnings, channel),
      )
    } catch (error) {
      if (error instanceof BuildError) {
        // Its errors (its warnings are in the channel already)
        channel.report(error.message, 'error', 'thrown')
        throw new StartBuildError(error, app.root, described())
      }
      throw error
    } finally {
      diagnostics = described()
      channel.close()
    }
  }
  let started = performance.now()
  let outputs = await build()
  for (let index = 1; index < builds; index++) {
    started = performance.now()
    outputs = await build()
  }
  const duration = performance.now() - started
  const describe = (env: Env) =>
    describeBuild({
      bundler: bundler === 'vite' ? 'vite' : 'rspack',
      env,
      mode,
      minify: target.minify,
      esModules: outputs[env].esModules,
      parsedModules: outputs[env].parsedModules,
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
    root: app.root,
    diagnostics,
    rebuild: async (edits = {}) => {
      for (const [file, content] of Object.entries(edits)) {
        const absolute = path.join(app.root, file)
        if (content === null) {
          await rm(absolute, { force: true })
        } else {
          await mkdir(path.dirname(absolute), { recursive: true })
          await writeFile(absolute, content)
        }
      }
      return buildAt(app, bundler, target, 1)
    },
  }
}

/**
 * A failed Start build: the bundler's errors (`BuildError`), and everything
 * the build reported on every channel, the error included (`diagnostics`;
 * SPEC §5.7: a compiler may print the details of a failure to the console
 * and fail the build with a short error).
 */
export class StartBuildError extends BuildError {
  constructor(
    error: BuildError,
    /** App root on disk. */
    readonly root: string,
    readonly diagnostics: Array<ChannelDiagnostic>,
  ) {
    super(error.bundler, error.errors, error.warnings)
    this.name = 'StartBuildError'
  }
}

type Env = 'client' | 'ssr'

type Channel = ReturnType<typeof openDiagnosticChannel>

/**
 * Where in its channel the build a result describes starts: a watch mode
 * build describes the rebuild its edits cause, not the first build.
 */
const describedFrom = new WeakMap<Channel, number>()

interface BuildTarget {
  root: string
  framework: 'react' | 'solid'
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
    /** Rsbuild production client: `describeBuild`'s `parsedModules`. */
    parsedModules?: ParsedModules
  }
>

const builders: Record<
  StartBundler,
  (
    target: BuildTarget,
    warnings: Record<Env, Array<string>>,
    channel: Channel,
  ) => Promise<Outputs>
> = {
  vite: buildWithVite,
  rsbuild: buildWithRsbuild,
}

/**
 * Builds with Vite. Bundler and logger warnings go to `warnings` (per
 * environment) and to `channel`; errors reach the channel through the
 * rejection (`buildAt`), which carries them.
 */
async function buildWithVite(
  target: BuildTarget,
  warnings: Record<Env, Array<string>>,
  channel: Channel,
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
          channel.report(stripAnsi(warning.message), 'warning', 'bundler')
        },
      },
    },
  })
  /** Vite's own warnings do not name the environment. */
  const warnBoth = (message: string) => {
    warnings.client.push(stripAnsi(message))
    warnings.ssr.push(stripAnsi(message))
    channel.report(stripAnsi(message), 'warning', 'vite')
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

/**
 * Builds with Rsbuild. Compilation warnings go to `warnings` (per
 * environment) and to `channel`; errors reach the channel through the
 * rejection (`buildAt`), which carries them.
 */
async function buildWithRsbuild(
  target: BuildTarget,
  warnings: Record<Env, Array<string>>,
  channel: Channel,
): Promise<Outputs> {
  const { createRsbuild, mergeRsbuildConfig } = await import('@rsbuild/core')
  const outputs: Partial<Outputs> = {}
  const errors: Array<string> = []
  /** The compiles of a watch mode build. */
  const compiles = trackCompiles()
  /** The evidence of the client's dangling-name check (`describeBuild`). */
  const clientParsedModules = parsedModules()
  /** Records what each environment emitted. */
  const outputPlugin: RsbuildPlugin = {
    name: 'start-build-harness:outputs',
    setup(api) {
      api.modifyRspackConfig((config, { environment }) => {
        if (environment.name === 'client' && target.mode === 'production') {
          config.plugins.push(recordParsedModules(clientParsedModules))
        }
      })
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
        channel.reportCompilation({ warnings: statsMessages(json.warnings) })
        errors.push(
          ...statsMessages(json.errors).map((message) => `[${env}] ${message}`),
        )
        outputs[env] = {
          outDir: environment.distPath,
          chunks: chunksOfStats(json, {
            entry: configuredEntry(environment.entry, env),
            extension: '.js',
          }),
          esModules: environment.config.output.module,
          ...(env === 'client' && { parsedModules: clientParsedModules }),
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
        describedFrom.set(channel, channel.mark())
        await compiles.edit(target.root, target.watchEdits, watchTimeout)
      } finally {
        await watching.close()
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
 * The name of the one entry Start configured for an environment (Rsbuild's
 * `environment.entry`, the configured inputs), whose chunks the page or the
 * server loads first.
 */
function configuredEntry(entry: Record<string, unknown>, env: Env): string {
  const names = Object.keys(entry)
  if (names.length !== 1) {
    throw new Error(
      `expected one configured entry of the ${env} environment, got ${names.join(', ') || 'none'}`,
    )
  }
  return names[0]!
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
