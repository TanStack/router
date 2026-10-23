/**
 * Real-build harness for Start goal tests whose outcome the bundler decides
 * (e.g. "server code never reaches the client bundle"). Builds an app the
 * way `vite build` or `rsbuild build` builds a Start app: with the plugins
 * its `vite.config.ts` or `rsbuild.config.ts` lists, `tanstackStart()` of
 * the built framework package (`@tanstack/react-start/plugin/vite` or
 * `/plugin/rsbuild`, `@tanstack/solid-start` for a Solid app; see
 * `start-plugins.ts`) and the framework's own plugin (`@vitejs/plugin-react`,
 * `@rsbuild/plugin-react`; a Solid app's comes from the test). The
 * `test:integration` target builds the packages first. So the framework
 * package's configuration, Start's environments (client, then SSR, which is
 * the server fn provider), the Start compiler, import protection, the
 * router generator and code splitter, and the generated server fn resolver
 * are Start's, and Rspack loads Start's loaders from the package as in an
 * installed app. The output of each environment is described and run with
 * the shared build harness (`@tanstack/compiler-test-utils/build-harness`).
 * The temporary apps live in this directory.
 *
 * `@tanstack/react-start` is the real package (`startRuntimeLinks`), and
 * `@tanstack/react-router` the real one too (a dependency of this package,
 * which the apps resolve like any dependency): both builds bundle and run
 * Start's runtime and the router. The server bundle's entry is Start's own
 * server entry, over a real router whose route tree has a probe server route
 * (`request-probe.ts`): an SSR script runs inside a real request of the app,
 * which that server entry serves (`inAppRequest`). What the test process
 * cannot do is stood in for: a client script
 * observes the requests a server fn call sends (`requestsOfPrelude`). An SSR
 * script calls a server fn by id through Start's own server entry and client
 * RPC (`callByIdPrelude`). The app's entries are the harness's unless the app
 * has its own (`src/client.*`, `src/server.*`), given to Start through its
 * documented options (`client.entry`, `server.entry`): the client entry
 * imports the app's documented router entry (`src/router.ts`, the harness's
 * real router unless the app has one; the client entry only the app's own),
 * its start entry (`src/start.ts` when the app has one; otherwise Start uses
 * the framework package's default) and the test's entry module, whose
 * exports `run()` gives the script as `entry`; the server entry is Start's
 * own (`@tanstack/<framework>-start/server-entry`). Vite builds run in the
 * app's directory, as `vite build` does.
 *
 * Everything a build reports, on every channel (the bundler's warnings and
 * errors, Vite's logger, `console.*` and the process streams; SPEC §5.7),
 * is in `StartBuild.diagnostics`, and a failed build rejects with a
 * `StartBuildError` carrying the same (`diagnostics`).
 *
 * Import protection is on, with Start's defaults unless the test configures
 * it; it checks the modules of the source directory (`src`) only.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  linkWorkspacePackages,
  workspacePackage,
  workspacePackageLinks,
} from '@tanstack/compiler-test-utils/workspace-packages'
import {
  BuildError,
  bundlerReports,
  chunksOfBundle,
  chunksOfStats,
  createApp,
  describeBuild,
  parsedModules,
  recordParsedModules,
  statsDiagnostics,
  statsMessages,
  statsOptions,
  stripAnsi,
  withBuildEnvironment,
} from '@tanstack/compiler-test-utils/build-harness'
import {
  rsbuildLogger,
  trackCompiles,
} from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import react from '@vitejs/plugin-react'
import { pluginReact } from '@rsbuild/plugin-react'
import { onTestFinished } from 'vitest'
import { inProbeRequest, requestFiles } from './request-probe'
import { startPlugins, startRsbuildPlugin } from './start-plugins'
import type {
  BuildMode,
  BuildResult,
  EmittedChunk,
  ParsedModules,
  StatsJson,
} from '@tanstack/compiler-test-utils/build-harness'
import type {
  ChannelDiagnostic,
  DiagnosticChannel,
} from '@tanstack/compiler-test-utils/diagnostic-channel'
import type { TanStackStartInputConfig } from '../src'
import type { ViolationInfo } from './importProtection/public-types'
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
 * Wraps a script of the SSR build's `run()` so that it runs inside a real
 * request of the app (`request-probe.ts`): the child process imports the
 * server bundle's entry the way a host does (its default export, Start's
 * server entry: `fetch`, or the module of a CommonJS bundle carrying it)
 * and sends it a request for the app's probe route, whose handler runs the
 * script while Start serves the request. Start's request context is then
 * the one its server entry opens for that request: the app's start options
 * and request middleware, its router.
 */
const inAppRequest = (serverEntryFile: string, script: string) =>
  `const inProbeRequest = ${inProbeRequest.toString()}
const serverModule = await import(${JSON.stringify(pathToFileURL(serverEntryFile).href)})
const serverEntry = typeof serverModule.default?.fetch === 'function' ? serverModule.default : serverModule.default?.default
if (typeof serverEntry?.fetch !== 'function') {
  throw new Error(${JSON.stringify(`${serverEntryFile} does not export a server entry`)})
}
return await inProbeRequest(
  (path) => serverEntry.fetch(new Request(new URL(path, 'http://localhost'))),
  async () => {
${script}
  },
)`

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
 *
 * `serverFnId(fn)` is the id of a server fn (or of its URL) as its public
 * `url` carries it: the server fn base (`createClientRpc(id).url` is the
 * base, then the id), then the id. It throws for a value without such a URL,
 * outside any `try` of the script: a server fn object is identified by
 * `url` alone (SPEC J4.1), never by Start's own metadata fields (§5.19).
 */
export const callByIdPrelude = `const serverFnBase = entry.createClientRpc('').url
const serverFnId = (fnOrUrl) => {
  const url = typeof fnOrUrl === 'string' ? fnOrUrl : fnOrUrl?.url
  if (
    typeof url !== 'string' ||
    !url.startsWith(serverFnBase) ||
    url.length === serverFnBase.length
  ) {
    throw new Error('not a server fn URL: ' + String(url))
  }
  return url.slice(serverFnBase.length)
}
const callById = async (id, data) => {
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
   * plugin is that package's `tanstackStart()`, and `solid` links the
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
   * Every import-protection violation the build reported through Start's
   * public `onViolation` callback, in order (the app's own `onViolation`,
   * when it has one, still decides: one it allows is not listed).
   */
  violations: Array<ViolationInfo>
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

/** The router package of each framework a build can use. */
const routerPackages = {
  react: '@tanstack/react-router',
  solid: '@tanstack/solid-router',
} as const

/**
 * The client entry of the app: imports the app's documented entries that
 * Start's default client entry imports, when the app has them (the router
 * entry `src/router.ts` and the start entry `src/start.ts`; Start's
 * defaults, as no test moves them), and the test's entry module.
 */
const clientEntry = (testEntry: string, start: boolean, router: boolean) =>
  `${start ? `import * as start from '../src/start'\n` : ''}${router ? `import * as router from '../src/router'\n` : ''}import * as entry from ${JSON.stringify(`../${testEntry}`)}
globalThis.__tssBuildHarnessApp = { ${[start && 'start', router && 'router'].filter(Boolean).join(', ')} }
globalThis.${entryGlobal} = entry
`

/**
 * The server entry of the app: Start's own server entry
 * (`@tanstack/<framework>-start/server-entry`, its default export, which
 * loads the app's router and start entries itself and serves the app's
 * requests: `inAppRequest`), and the test's entry module.
 */
const serverEntry = (testEntry: string, framework: 'react' | 'solid') =>
  `import * as entry from ${JSON.stringify(`../${testEntry}`)}
globalThis.${entryGlobal} = entry
export { default } from '@tanstack/${framework}-start/server-entry'
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

/**
 * The files the harness adds to every app, unless the app has them: the
 * entries, the render helper, and what a request of the app needs
 * (`requestFiles`: a real router over the generated route tree, its root
 * route and the probe route; the router only when the app has no router
 * entry of its own).
 */
const harnessFiles = (
  entries: { client: string; ssr: string },
  files: Record<string, string>,
  framework: 'react' | 'solid',
) => {
  const ownStart = 'src/start.ts' in files
  const ownRouter = Object.keys(files).some((file) =>
    /^src\/router\.[cm]?[jt]sx?$/.test(file),
  )
  const { 'src/router.ts': router, ...routes } = requestFiles(
    routerPackages[framework],
  )
  return {
    'harness/client-entry.ts': clientEntry(entries.client, ownStart, ownRouter),
    'harness/server-entry.ts': serverEntry(entries.ssr, framework),
    'harness/render.ts': renderFile,
    ...(!ownRouter && { 'src/router.ts': router }),
    ...routes,
  }
}

/** The harness's entries of an app (used where the app has none). */
const harnessEntries = (root: string) => ({
  client: path.join(root, 'harness/client-entry.ts'),
  server: path.join(root, 'harness/server-entry.ts'),
})

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
      ...harnessFiles(entries, files, options.framework ?? 'react'),
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
  const violations: Array<ViolationInfo> = []
  const start = options.start ?? {}
  const userOnViolation = start.importProtection?.onViolation
  const target: BuildTarget = {
    root: app.root,
    framework: options.framework ?? 'react',
    mode,
    minify: options.minify ?? mode === 'production',
    sourcemap: options.sourcemap ?? false,
    // Records what Start's public `onViolation` receives
    start: {
      ...start,
      importProtection: {
        ...start.importProtection,
        onViolation: async (info) => {
          const verdict = await userOnViolation?.(info)
          // (`false` allows the import: Start reports nothing)
          if (verdict !== false) {
            violations.push(info as ViolationInfo)
          }
          return verdict
        },
      },
    },
    violations,
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
  const warnings = { client: [], ssr: [] } as Record<
    Env,
    Array<ChannelDiagnostic>
  >
  const consoleMessages: Array<ChannelDiagnostic> = []
  let diagnostics: Array<ChannelDiagnostic> = []
  /** One build, recording what it reports on every channel. */
  const build = async () => {
    warnings.client.length = 0
    warnings.ssr.length = 0
    consoleMessages.length = 0
    target.violations.length = 0
    // The build's own channel (`withBuildEnvironment`): its async scope
    // and its app root (output a bundler prints from native callbacks)
    let channel: Channel | undefined
    /** What the build described reported (a watch build: the rebuild's). */
    const described = () =>
      channel ? channel.since(describedFrom.get(channel) ?? 0) : []
    try {
      return await withBuildEnvironment(mode, consoleMessages, (scoped) => {
        channel = scoped
        scoped.claim(app.root)
        return builders[bundler](target, warnings, scoped)
      })
    } catch (error) {
      if (error instanceof BuildError) {
        const reported = described()
        // The failure itself, unless the compilation reported its errors
        // (Rsbuild: recorded from the compilation, once)
        const thrown: Array<ChannelDiagnostic> = reported.some(
          ({ severity, source }) =>
            severity === 'error' && source === 'bundler',
        )
          ? []
          : [
              {
                severity: 'error',
                text: stripAnsi(error.message),
                raw: error,
                source: 'thrown',
              },
            ]
        throw new StartBuildError(
          error,
          app.root,
          [...reported, ...thrown],
          [...target.violations],
        )
      }
      throw error
    } finally {
      diagnostics = described()
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
  const serverEntryFile = path.join(ssr.outDir, ssr.entry.fileName)
  return {
    client: await describe('client'),
    ssr: {
      ...ssr,
      run: (script = '') => ssr.run(inAppRequest(serverEntryFile, script)),
    },
    root: app.root,
    diagnostics,
    violations: [...target.violations],
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
    /** What Start's `onViolation` received (`StartBuild.violations`). */
    readonly violations: Array<ViolationInfo>,
  ) {
    super(error.bundler, error.errors, error.warnings)
    this.name = 'StartBuildError'
  }
}

type Env = 'client' | 'ssr'

type Channel = DiagnosticChannel

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
  /** What `start`'s `onViolation` received during the current build. */
  violations: Array<ViolationInfo>
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
    warnings: Record<Env, Array<ChannelDiagnostic>>,
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
  warnings: Record<Env, Array<ChannelDiagnostic>>,
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
  /**
   * The app's own handler of bundler warnings: `build.rolldownOptions.onwarn`
   * as the app's config and plugins resolve it (e.g. `@vitejs/plugin-react`
   * drops the warnings about React's `"use client"` directives). Each
   * environment's warnings go through it, and what it passes on to Vite is
   * what the build reports, as `vite build` prints it.
   */
  let appOnwarn: Onwarn | undefined
  const appOnwarnPlugin: Plugin = {
    name: 'start-build-harness:app-onwarn',
    configResolved(config) {
      const resolved = config.build.rolldownOptions.onwarn as Onwarn | undefined
      // (also called with each environment's config, whose handler is the
      // harness's own)
      if (resolved && !recorders.has(resolved)) {
        appOnwarn = resolved
      }
    },
  }
  const recorders = new WeakSet<Onwarn>()
  /** The build options of `env`, which records its bundler warnings. */
  const environmentBuild = (env: Env) => {
    const record = (warning: { message: string }) => {
      warnings[env].push(...bundlerReports([warning.message], 'warning'))
      channel.report(stripAnsi(warning.message), 'warning', 'bundler')
    }
    const onwarn: Onwarn = (warning) =>
      appOnwarn ? appOnwarn(warning, record) : record(warning)
    recorders.add(onwarn)
    return {
      build: {
        minify: target.minify,
        sourcemap: target.sourcemap,
        emptyOutDir: true,
        target: 'esnext',
        rolldownOptions: { onwarn },
      },
    }
  }
  /** Vite's own warnings do not name the environment. */
  const warnBoth = (message: string) => {
    warnings.client.push(...bundlerReports([message], 'warning', 'vite'))
    warnings.ssr.push(...bundlerReports([message], 'warning', 'vite'))
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
            startPlugins(
              target.framework,
              target.root,
              target.start,
              harnessEntries(target.root),
            ),
            // A React app's own Vite plugin, as in every React Start app,
            // unless the test configures it
            ...(target.framework === 'react' &&
            !hasReactPlugin(target.viteConfig?.plugins)
              ? [react()]
              : []),
            outputPlugin,
            appOnwarnPlugin,
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

/** A handler of Rolldown warnings (`build.rolldownOptions.onwarn`). */
type Onwarn = (
  warning: { message: string; code?: string },
  handler?: (warning: { message: string }) => void,
) => void

/** Whether a test's Vite plugins include `@vitejs/plugin-react`. */
function hasReactPlugin(plugins: InlineConfig['plugins']): boolean {
  return (plugins ?? [])
    .flat(Infinity as 1)
    .some(
      (plugin) =>
        !!plugin &&
        typeof plugin === 'object' &&
        'name' in plugin &&
        String(plugin.name).startsWith('vite:react'),
    )
}

/** Whether a test's Rsbuild plugins include the plugin named `name`. */
function hasRsbuildPlugin(
  plugins: RsbuildConfig['plugins'],
  name: string,
): boolean {
  return (plugins ?? [])
    .flat(Infinity as 1)
    .some(
      (plugin) =>
        !!plugin &&
        typeof plugin === 'object' &&
        'name' in plugin &&
        plugin.name === name,
    )
}

/**
 * Builds with Rsbuild. Compilation warnings go to `warnings` (per
 * environment) and to `channel`; errors reach the channel through the
 * rejection (`buildAt`), which carries them.
 */
async function buildWithRsbuild(
  target: BuildTarget,
  warnings: Record<Env, Array<ChannelDiagnostic>>,
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
        for (const child of 'compilers' in compiler
          ? compiler.compilers
          : [compiler]) {
          channel.scopeRspack(child)
          // Each compile's report, once, before Rsbuild's logger prints its
          // summary of it (`reportLogged`)
          child.hooks.done.tap(
            { name: 'start-build-harness:report', stage: -100 },
            (stats) => {
              // (each message with the module it is about, as Rspack's
              // stats name it)
              const json = stats.toJson(statsOptions) as StatsJson
              channel.reportCompilation({
                errors: statsMessages(json.errors),
                warnings: statsMessages(json.warnings),
              })
            },
          )
        }
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
        warnings[env].push(...statsDiagnostics(json.warnings, 'warning'))
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
          // Rsbuild prints nothing; its logger feeds the channel
          logLevel: 'silent',
          customLogger: rsbuildLogger(channel),
          output: {
            minify: target.minify,
            sourceMap: target.sourcemap ? { js: 'source-map' } : false,
            cleanDistPath: true,
          },
          plugins: [
            // A React app's own Rsbuild plugin, as in every React Start app,
            // unless the test configures it
            ...(target.framework === 'react' &&
            !hasRsbuildPlugin(target.rsbuildConfig?.plugins, 'rsbuild:react')
              ? [pluginReact()]
              : []),
            startRsbuildPlugin(
              target.framework,
              target.root,
              target.start,
              harnessEntries(target.root),
            ),
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
        // (the violations the rebuild reports)
        target.violations.length = 0
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
