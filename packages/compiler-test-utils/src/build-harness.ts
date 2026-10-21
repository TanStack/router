/**
 * Real-build harness for goal tests whose outcome the bundler decides: which
 * chunk code ends up in, what tree-shaking drops, what side-effect hints
 * change. Writes a small app to disk, builds it with one of the bundlers the
 * router plugin supports, describes the emitted chunks (entry, eager, lazy)
 * and runs the output where it runs in an app: SSR output in a separate
 * Node process, client output in a page of a real browser (headless
 * Chromium). Describing a production client build of Vite, Rspack or
 * webpack rejects emitted chunks that read a name that is neither declared,
 * imported nor a browser global (`DanglingNameError`).
 *
 * Plugin-agnostic: the caller supplies the plugin of each build, and the
 * directory its apps live in (where their imports resolve).
 */
import { readFileSync } from 'node:fs'
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { SourceMap as NodeSourceMap } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format } from 'node:util'
import { runNodeProgram } from './run-node'
import { savingDirectory } from './save-file'
import type { AddressInfo } from 'node:net'
import type { BrowserPage } from './browser'

export type Bundler = 'vite' | 'rspack' | 'webpack' | 'esbuild'

/** Every bundler the router plugin has an adapter for. */
export const bundlers: ReadonlyArray<Bundler> = [
  'vite',
  'rspack',
  'webpack',
  'esbuild',
]

export type BuildEnv = 'client' | 'ssr'

export type BuildMode = 'production' | 'development'

/**
 * Where a marker occurs in the output: only in chunks the entry loads
 * eagerly, only in chunks loaded on demand, in both (duplicated code), or
 * nowhere (dropped).
 */
export type Placement = 'eager' | 'lazy' | 'eager+lazy' | 'nowhere'

export interface Chunk {
  /** Path relative to the output directory. */
  fileName: string
  code: string
  isEntry: boolean
  /**
   * Chunks loaded with this one: its static imports (webpack and Rspack:
   * the other chunks of its chunk group).
   */
  imports: Array<string>
  /** Chunks this chunk loads on demand (`import()`). */
  dynamicImports: Array<string>
  /** Source map of the chunk (`sourcemap` builds only). */
  map?: SourceMap
}

export interface SourceMap {
  version: number
  sources: Array<string>
  sourcesContent?: Array<string | null>
  names: Array<string>
  mappings: string
}

export interface AppOptions {
  /**
   * Directory the temporary app is created in: the app's bare imports
   * resolve from there (e.g. to the workspace packages of the package that
   * owns it).
   */
  dir: string
  /** App files by path relative to the app root. */
  files: Record<string, string>
  /**
   * The app's `package.json`. The default declares no `sideEffects`, so the
   * app's own modules count as side-effectful. `null` writes none: the app
   * then inherits the nearest package.json above `dir`.
   */
  packageJson?: Record<string, unknown> | null
  /** Shorthand for `packageJson.sideEffects`. */
  sideEffects?: boolean | Array<string>
  /**
   * Symbolic links by path relative to the app root, each pointing to a path
   * relative to the app root (e.g. a route file linked from elsewhere) or to
   * an absolute path (e.g. a workspace package linked into `node_modules`).
   */
  symlinks?: Record<string, string>
  /** Directory name prefix of the temporary app. */
  prefix?: string
  /**
   * Registers a function to run when the current test finishes, e.g. the
   * test runner's `onTestFinished`. The harness disposes of what it created
   * (servers, temporary app directories) through it; without it, the caller
   * disposes.
   */
  registerCleanup?: (cleanup: () => Promise<void>) => void
}

export interface AppInfo {
  root: string
  env: BuildEnv
  mode: BuildMode
}

export interface BundleTarget {
  bundler: Bundler
  /** Entry module relative to the app root (default `entry.ts`). */
  entry?: string
  /** Default `production`. */
  mode?: BuildMode
  /**
   * `ssr` (default) targets Node with React externalised; `client` targets
   * the browser with everything bundled.
   */
  env?: BuildEnv
  /**
   * Defaults to `mode === 'production'`, like a real app build, except for
   * Vite SSR builds, which Vite does not minify by default. webpack and
   * Rspack only drop unused code inside a kept module when minifying: an
   * unminified production client build ships that code, and the
   * dangling-name check reads it (see `checkDanglingNames`).
   */
  minify?: boolean
  /** Output directory relative to the app root (default `dist`). */
  outDir?: string
  /**
   * `NODE_ENV` of the build process: the mode by default, like a build
   * command; `null` unsets it, like a shell that exports none (webpack and
   * Rspack only set it inside the bundle).
   */
  nodeEnv?: string | null
  /** Emits a source map for each chunk (`Chunk.map`). Default `false`. */
  sourcemap?: boolean
  /** Creates the plugin (a Vite plugin array for Vite) of this build. */
  plugin?: (app: AppInfo) => unknown
  /**
   * Import source of the automatic JSX runtime the harness's own TypeScript
   * and JSX transform uses (default `react`), e.g. `vue` for `vue/jsx-runtime`.
   */
  jsxImportSource?: string
  /**
   * webpack and Rspack: module rules that compile the app's TypeScript and
   * JSX instead of the harness's (e.g. `babel-loader` with a framework's JSX
   * preset). Each rule gets `include: <app root>` unless it sets `include`
   * or `exclude`.
   */
  sourceRules?: Array<Record<string, unknown>>
  /**
   * webpack and Rspack: export conditions resolved before the bundler's
   * defaults (e.g. `solid`, for packages that ship JSX source).
   */
  conditions?: Array<string>
  /**
   * webpack and Rspack: build in watch mode with a memory cache, then write
   * these files (by path relative to the app root) and describe the output
   * of the cached rebuild they cause, as a dev or `--watch` build would emit
   * after an edit.
   */
  rebuildAfter?: Record<string, string>
  /**
   * webpack and Rspack: adjusts the bundler's configuration the harness
   * built before the compiler is created (e.g. a persistent `cache`), as an
   * app's own configuration file would set it.
   */
  configure?: (options: Record<string, unknown>) => void
}

export interface RunResult {
  /** JSON value the script returned. */
  result: unknown
  /** Console output of the run (all levels, formatted). */
  logs: Array<string>
  /** `document.body.innerHTML` after the script (client builds only). */
  html?: string
}

export interface BuildResult {
  bundler: Bundler
  env: BuildEnv
  /** App root on disk. */
  root: string
  outDir: string
  chunks: Array<Chunk>
  entry: Chunk
  /** The entry and every chunk loaded with it, transitively. */
  eager: Array<string>
  /** Chunks loaded only on demand. */
  lazy: Array<string>
  /** Warnings reported through the bundler (its own and its plugins'). */
  warnings: Array<string>
  /** `console.warn`/`console.error` output during the build. */
  consoleMessages: Array<string>
  /** Build time in milliseconds. */
  duration: number
  /** Chunks whose code contains `marker`, split into eager and lazy. */
  locate: (marker: string | RegExp) => {
    eager: Array<string>
    lazy: Array<string>
  }
  where: (marker: string | RegExp) => Placement
  /**
   * Loads the entry and returns the JSON value `script` returns. `script` is
   * an async function body with the entry's exports in scope as `entry`.
   * SSR builds run in a separate Node process; client builds in a page of
   * headless Chromium that serves the output directory over HTTP (the page
   * is `/`, with a `<div id="root">`).
   */
  run: (script?: string) => Promise<RunResult>
  /** Removes the app directory. */
  dispose: () => Promise<void>
}

/**
 * A production client build emitted code that reads names no chunk declares
 * or imports and that are no global of a browser: that code throws a
 * ReferenceError when it runs in a browser. `names` lists them by chunk.
 */
export class DanglingNameError extends Error {
  constructor(
    readonly bundler: Bundler,
    readonly names: Record<string, Array<string>>,
  ) {
    super(
      `${bundler}: the production client build reads names that are never declared or imported:\n${Object.entries(
        names,
      )
        .map(([fileName, list]) => `  ${fileName}: ${list.join(', ')}`)
        .join('\n')}`,
    )
    this.name = 'DanglingNameError'
  }
}

/** A build failed; `errors` are the bundler's error messages. */
export class BuildError extends Error {
  constructor(
    readonly bundler: Bundler,
    readonly errors: Array<string>,
    readonly warnings: Array<string>,
  ) {
    super(`${bundler} build failed:\n${errors.join('\n')}`)
    this.name = 'BuildError'
  }
}

export interface App {
  root: string
  /** Builds the app; builds of one app need distinct `outDir`s. */
  bundle: (target: BundleTarget) => Promise<BuildResult>
  /** Removes the app directory. */
  dispose: () => Promise<void>
}

export type BundleOptions = AppOptions & Omit<BundleTarget, 'plugin'>

/** Creates the plugin of each bundler a test builds with. */
export type BundlerPlugins = Partial<Record<Bundler, (app: AppInfo) => unknown>>

const harnessDir = path.dirname(fileURLToPath(import.meta.url))
const oxcLoader = path.join(harnessDir, 'build-harness-oxc-loader.mjs')

const defaultPackageJson = { name: 'app', private: true, type: 'module' }

/** Bare imports kept external in SSR builds (resolved by Node at run time). */
const ssrExternal = /^(react|react-dom)(\/.*)?$/

/**
 * Writes an app to a temporary directory in `options.dir`, so that its
 * imports resolve from there. The directory is removed by `dispose()`, which
 * `registerCleanup` also receives.
 */
export async function createApp(options: AppOptions): Promise<App> {
  const root = await mkdtemp(
    path.join(options.dir, options.prefix ?? '.build-harness-'),
  )
  const dispose = async () => {
    await rm(root, { recursive: true, force: true })
    // What the dev-server harnesses saved the app's files through
    await rm(savingDirectory(root), { recursive: true, force: true })
  }
  options.registerCleanup?.(dispose)
  try {
    const packageJson =
      options.packageJson === null
        ? null
        : {
            ...(options.packageJson ?? defaultPackageJson),
            ...(options.sideEffects !== undefined && {
              sideEffects: options.sideEffects,
            }),
          }
    const files = {
      ...(packageJson && { 'package.json': JSON.stringify(packageJson) }),
      ...options.files,
    }
    for (const [file, code] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await writeFile(path.join(root, file), code)
    }
    for (const [link, target] of Object.entries(options.symlinks ?? {})) {
      await mkdir(path.dirname(path.join(root, link)), { recursive: true })
      await symlink(path.resolve(root, target), path.join(root, link))
    }
  } catch (error) {
    await dispose()
    throw error
  }
  return {
    root,
    bundle: (target) => bundle(root, dispose, target),
    dispose,
  }
}

/**
 * Builds a one-off app with the plugin `plugins` gives for the bundler, and
 * describes the output.
 */
export async function bundleApp(
  options: BundleOptions & { plugins?: BundlerPlugins },
): Promise<BuildResult> {
  const {
    dir,
    files,
    packageJson,
    sideEffects,
    symlinks,
    prefix,
    registerCleanup,
    plugins,
    ...target
  } = options
  const app = await createApp({
    dir,
    files,
    packageJson,
    sideEffects,
    symlinks,
    prefix: prefix ?? `.build-harness-${target.bundler}-`,
    registerCleanup,
  })
  try {
    return await app.bundle({ ...target, plugin: plugins?.[target.bundler] })
  } catch (error) {
    await app.dispose()
    throw error
  }
}

interface BundlerConfig {
  root: string
  outDir: string
  entry: string
  mode: BuildMode
  env: BuildEnv
  minify: boolean
  sourcemap: boolean
  plugin: (() => unknown) | undefined
  jsxImportSource: string
  sourceRules: Array<Record<string, unknown>> | undefined
  conditions: Array<string>
  rebuildAfter: Record<string, string> | undefined
  configure: ((options: Record<string, unknown>) => void) | undefined
  /** Production client builds: records `describeBuild`'s `parsedModules`. */
  parsedModules: ParsedModules | undefined
}

/** An emitted chunk, as a bundler reports it. */
export interface EmittedChunk {
  /** Path relative to the output directory. */
  fileName: string
  isEntry: boolean
  /** Chunks loaded with this one (see `Chunk.imports`). */
  imports: Array<string>
  /** Chunks this chunk loads on demand. */
  dynamicImports: Array<string>
}

async function bundle(
  root: string,
  dispose: () => Promise<void>,
  target: BundleTarget,
): Promise<BuildResult> {
  const {
    bundler,
    entry = 'entry.ts',
    mode = 'production',
    env = 'ssr',
    plugin,
  } = target
  const config: BundlerConfig = {
    root,
    outDir: path.join(root, target.outDir ?? 'dist'),
    entry: path.join(root, entry),
    mode,
    env,
    // `vite build --ssr` does not minify
    minify:
      target.minify ??
      (mode === 'production' && !(bundler === 'vite' && env === 'ssr')),
    sourcemap: target.sourcemap ?? false,
    plugin: plugin && (() => plugin({ root, env, mode })),
    jsxImportSource: target.jsxImportSource ?? 'react',
    sourceRules: target.sourceRules,
    conditions: target.conditions ?? [],
    rebuildAfter: target.rebuildAfter,
    configure: target.configure,
    parsedModules:
      bundler !== 'esbuild' && env === 'client' && mode === 'production'
        ? parsedModules()
        : undefined,
  }
  if (config.rebuildAfter && bundler !== 'webpack' && bundler !== 'rspack') {
    throw new Error(`rebuildAfter: not supported for ${bundler}`)
  }
  if (config.configure && bundler !== 'webpack' && bundler !== 'rspack') {
    throw new Error(`configure: not supported for ${bundler}`)
  }
  const warnings: Array<string> = []
  const consoleMessages: Array<string> = []
  const started = performance.now()
  const output = await withBuildEnvironment(
    target.nodeEnv === undefined ? mode : target.nodeEnv,
    consoleMessages,
    () => builders[bundler](config, warnings),
  )
  const duration = performance.now() - started
  return describeBuild({
    bundler,
    env,
    mode,
    minify: config.minify,
    root,
    outDir: config.outDir,
    chunks: output,
    sourcemap: config.sourcemap,
    parsedModules: config.parsedModules,
    warnings,
    consoleMessages,
    duration,
    dispose,
  })
}

const builders: Record<
  Bundler,
  (
    config: BundlerConfig,
    warnings: Array<string>,
  ) => Promise<Array<EmittedChunk>>
> = {
  vite: buildWithVite,
  rspack: (config, warnings) => buildWithWebpackApi('rspack', config, warnings),
  webpack: (config, warnings) =>
    buildWithWebpackApi('webpack', config, warnings),
  esbuild: buildWithEsbuild,
}

async function buildWithVite(
  config: BundlerConfig,
  warnings: Array<string>,
): Promise<Array<EmittedChunk>> {
  const { build: viteBuild } = await import('vite')
  const errors: Array<string> = []
  const hooks: Array<Promise<unknown>> = []
  let result
  try {
    result = await viteBuild({
      root: config.root,
      configFile: false,
      envDir: false,
      publicDir: false,
      mode: config.mode,
      logLevel: 'warn',
      customLogger: {
        info: () => {},
        warn: (message) => warnings.push(stripAnsi(message)),
        warnOnce: (message) => warnings.push(stripAnsi(message)),
        error: (message) => {
          // The thrown error carries the message; skip the summary line
          if (!/Build failed in/.test(message)) {
            errors.push(stripAnsi(message))
          }
        },
        clearScreen: () => {},
        hasErrorLogged: () => false,
        hasWarned: false,
      },
      plugins: [
        ...(config.plugin
          ? [trackingHooks(config.plugin(), hooks) as never]
          : []),
        // The evidence of the dangling-name check (`checkDanglingNames`)
        ...(config.parsedModules
          ? [recordViteModules(config.parsedModules) as never]
          : []),
      ],
      ...(config.jsxImportSource !== 'react' && {
        oxc: { jsx: { importSource: config.jsxImportSource } },
      }),
      build: {
        ssr: config.env === 'ssr' ? config.entry : false,
        outDir: config.outDir,
        emptyOutDir: true,
        minify: config.minify,
        sourcemap: config.sourcemap,
        target: 'esnext',
        modulePreload: { polyfill: false },
        rollupOptions: {
          // Keep the entry's exports in client builds too, for `run()`
          ...(config.env === 'client' && {
            input: config.entry,
            preserveEntrySignatures: 'exports-only',
          }),
          onwarn(warning, warn) {
            // Vite silences these for node_modules; the workspace packages
            // are linked, so it would report every "use client" of theirs.
            if (
              warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
              !warning.id?.startsWith(config.root)
            ) {
              return
            }
            warn(warning)
          },
          output: {
            entryFileNames: 'entry.mjs',
            chunkFileNames: '[name].mjs',
          },
        },
      },
    })
  } catch (error) {
    await settled(hooks)
    throw new BuildError('vite', [...errors, errorMessage(error)], warnings)
  }
  await settled(hooks)
  const chunks: Array<EmittedChunk> = []
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!('output' in output)) {
      throw new Error('Unexpected watcher from vite build')
    }
    chunks.push(...chunksOfBundle(output.output))
  }
  return chunks
}

/**
 * The plugin option of a Vite build, each hook recording the promise it
 * returns in `hooks`. Vite runs the `configResolved` hooks of its plugins
 * with `Promise.all`, so a build that fails in one of them rejects while
 * the others still run: the route generator's then renames the route tree
 * into the app after the build returned, which raced `dispose()` (ENOTEMPTY)
 * and printed into the next build's console messages. A build is over once
 * every hook it started has settled (see `settled`).
 */
function trackingHooks(
  option: unknown,
  hooks: Array<Promise<unknown>>,
): unknown {
  if (Array.isArray(option)) {
    return option.map((item) => trackingHooks(item, hooks))
  }
  if (isPromiseLike(option)) {
    return Promise.resolve(option).then((item) => trackingHooks(item, hooks))
  }
  // Plain plugin objects only (Rolldown's builtin plugins are instances)
  if (
    typeof option !== 'object' ||
    option === null ||
    Object.getPrototypeOf(option) !== Object.prototype
  ) {
    return option
  }
  const track = (hook: (...args: Array<unknown>) => unknown) =>
    function (this: unknown, ...args: Array<unknown>) {
      const result = hook.apply(this, args)
      if (isPromiseLike(result)) {
        hooks.push(Promise.resolve(result))
      }
      return result
    }
  const plugin: Record<string, unknown> = { ...option }
  for (const [key, value] of Object.entries(plugin)) {
    if (typeof value === 'function') {
      plugin[key] = track(value as never)
    } else if (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { handler?: unknown }).handler === 'function'
    ) {
      const { handler } = value as { handler: never }
      plugin[key] = { ...value, handler: track(handler) }
    }
  }
  return plugin
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}

/** Waits for every promise in `hooks`, including ones added meanwhile. */
async function settled(hooks: Array<Promise<unknown>>) {
  for (let done = 0; done < hooks.length; ) {
    const next = hooks.length
    await Promise.allSettled(hooks.slice(done, next))
    done = next
  }
}

/** The chunks of a Vite (Rolldown) bundle: its output items. */
export function chunksOfBundle(
  items: Iterable<
    | {
        type: 'chunk'
        fileName: string
        isEntry: boolean
        imports: Array<string>
        dynamicImports: Array<string>
      }
    | { type: 'asset' }
  >,
): Array<EmittedChunk> {
  const chunks: Array<EmittedChunk> = []
  for (const item of items) {
    if (item.type === 'chunk') {
      chunks.push({
        fileName: item.fileName,
        isEntry: item.isEntry,
        imports: item.imports,
        dynamicImports: item.dynamicImports,
      })
    }
  }
  return chunks
}

/** webpack and Rspack share the configuration and the stats format. */
async function buildWithWebpackApi(
  bundler: 'webpack' | 'rspack',
  config: BundlerConfig,
  warnings: Array<string>,
): Promise<Array<EmittedChunk>> {
  const ssr = config.env === 'ssr'
  const development = config.mode === 'development'
  // TypeScript and JSX of the app's own files: Rspack's built-in SWC
  // loader; webpack has none, so a small Oxc loader.
  const sourceRules = config.sourceRules
    ? config.sourceRules.map((rule) =>
        'include' in rule || 'exclude' in rule
          ? rule
          : { include: config.root, ...rule },
      )
    : bundler === 'rspack'
      ? (['ts', 'tsx', 'jsx'] as const).map((lang) => ({
          test: { ts: /\.[cm]?ts$/, tsx: /\.tsx$/, jsx: /\.[cm]?jsx$/ }[lang],
          include: config.root,
          loader: 'builtin:swc-loader',
          options: swcOptions(development, lang, config.jsxImportSource),
          type: 'javascript/auto',
        }))
      : [
          {
            test: /\.[cm]?(tsx?|jsx)$/,
            include: config.root,
            loader: oxcLoader,
            options: { development, importSource: config.jsxImportSource },
          },
        ]
  const options = {
    mode: config.mode,
    context: config.root,
    entry: { entry: config.entry },
    target: ssr ? 'node' : 'web',
    devtool: config.sourcemap ? 'source-map' : false,
    output: {
      path: config.outDir,
      filename: '[name].mjs',
      chunkFilename: '[id].mjs',
      module: true,
      chunkFormat: 'module',
      chunkLoading: 'import',
      library: { type: 'module' },
      publicPath: 'auto',
      clean: true,
    },
    experiments: { outputModule: true },
    resolve: {
      extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
      ...(config.conditions.length && {
        conditionNames: [...config.conditions, '...'],
      }),
    },
    module: {
      rules: [
        ...sourceRules,
        // Extensionless relative imports, as in the other bundlers
        { test: /\.[cm]?[jt]sx?$/, resolve: { fullySpecified: false } },
      ],
    },
    externalsType: 'node-commonjs',
    externals: ssr
      ? [
          (
            { request }: { request?: string },
            callback: (error?: Error | null, result?: string) => void,
          ) =>
            request && ssrExternal.test(request)
              ? callback(null, request)
              : callback(),
        ]
      : [],
    optimization: {
      minimize: config.minify,
      // The entry chunk carries the runtime; no vendor chunks
      splitChunks: { chunks: 'async' },
    },
    performance: { hints: false },
    infrastructureLogging: { level: 'none' },
    plugins: [
      ...(config.plugin ? [config.plugin()] : []),
      // The evidence of the dangling-name check (`checkDanglingNames`)
      ...(config.parsedModules
        ? [recordParsedModules(config.parsedModules)]
        : []),
    ],
  }
  config.configure?.(options)

  if (config.rebuildAfter) {
    const stats = await watchAndRebuild(
      bundler,
      { ...options, cache: bundler === 'rspack' ? true : { type: 'memory' } },
      config.root,
      config.rebuildAfter,
      warnings,
    )
    const json = stats.toJson(statsOptions)
    warnings.push(...statsMessages(json.warnings))
    if (json.errors?.length) {
      throw new BuildError(bundler, statsMessages(json.errors), warnings)
    }
    return chunksOfStats(json, { entry: 'entry', extension: '.mjs' })
  }

  const stats = await new Promise<WebpackStats>((resolve, reject) => {
    const run = (compiler: WebpackCompiler) =>
      compiler.run((error, result) => {
        compiler.close(() => {
          if (error) {
            reject(new BuildError(bundler, [errorMessage(error)], warnings))
          } else {
            resolve(result!)
          }
        })
      })
    if (bundler === 'rspack') {
      import('@rsbuild/core')
        .then(({ rspack }) => run(rspack(options as never) as never))
        .catch(reject)
    } else {
      import('webpack')
        .then(({ default: webpack }) => run(webpack(options as never) as never))
        .catch(reject)
    }
  })

  const json = stats.toJson(statsOptions)
  warnings.push(...statsMessages(json.warnings))
  if (json.errors?.length) {
    throw new BuildError(bundler, statsMessages(json.errors), warnings)
  }
  return chunksOfStats(json, { entry: 'entry', extension: '.mjs' })
}

/**
 * Builds in the compiler's watch mode (`compiler.watch`, with `options`'
 * cache), waits for the builds to settle, writes `files` (paths relative to
 * `root`), and returns the stats of the last build once the rebuilds they
 * cause settle. Fails after 30 s without a settled rebuild.
 */
async function watchAndRebuild(
  bundler: 'webpack' | 'rspack',
  options: Record<string, unknown>,
  root: string,
  files: Record<string, string>,
  warnings: Array<string>,
): Promise<WebpackStats> {
  const compiler = (bundler === 'rspack'
    ? (await import('@rsbuild/core')).rspack(options as never)
    : (await import('webpack')).default(
        options as never,
      )) as unknown as WebpackCompiler & {
    watch: (
      options: { aggregateTimeout: number },
      callback: (error: Error | null, stats?: WebpackStats) => void,
    ) => { close: (callback: () => void) => void }
  }
  let builds = 0
  let last: { error: Error | null; stats?: WebpackStats } | undefined
  const watching = compiler.watch({ aggregateTimeout: 50 }, (error, stats) => {
    builds++
    last = { error, stats }
  })
  const deadline = Date.now() + 30_000
  /** Waits for a build after the `after`th, then for 500 ms without one. */
  const settle = async (after: number) => {
    let seen = -1
    while (builds <= after || seen !== builds) {
      if (Date.now() > deadline) {
        throw new BuildError(bundler, ['timed out waiting for a build'], [])
      }
      seen = builds > after ? builds : -1
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  try {
    await settle(0)
    const before = builds
    for (const [file, code] of Object.entries(files)) {
      await writeFile(path.join(root, file), code)
    }
    await settle(before)
  } finally {
    await new Promise<void>((resolve) => watching.close(() => resolve()))
  }
  if (last!.error) {
    throw new BuildError(bundler, [errorMessage(last!.error)], warnings)
  }
  return last!.stats!
}

/** The `toJson` options of the stats `chunksOfStats` reads. */
export const statsOptions = {
  all: false,
  ids: true,
  chunks: true,
  chunkRelations: true,
  entrypoints: true,
  errors: true,
  warnings: true,
} as const

/**
 * The chunks of a webpack or Rspack compilation
 * (`stats.toJson(statsOptions)`): the files ending with `extension` of each
 * chunk, the chunks of the `entry` entrypoint being loaded eagerly.
 */
export function chunksOfStats(
  json: StatsJson,
  options: { entry: string; extension: string },
): Array<EmittedChunk> {
  const filesById = new Map<string | number, Array<string>>()
  for (const chunk of json.chunks ?? []) {
    filesById.set(
      chunk.id!,
      (chunk.files ?? []).filter((file) => file.endsWith(options.extension)),
    )
  }
  const filesOf = (ids: Iterable<string | number> | undefined) =>
    [...(ids ?? [])].flatMap((id) => filesById.get(id) ?? [])
  const entryChunkIds = new Set(json.entrypoints?.[options.entry]?.chunks ?? [])
  const raw: Array<EmittedChunk> = []
  for (const chunk of json.chunks ?? []) {
    const initial = entryChunkIds.has(chunk.id!)
    const loadedWith = initial
      ? filesOf(entryChunkIds)
      : filesOf(chunk.siblings)
    for (const fileName of filesById.get(chunk.id!) ?? []) {
      raw.push({
        fileName,
        isEntry: initial && chunk.entry === true,
        imports: loadedWith.filter((file) => file !== fileName),
        dynamicImports: filesOf(chunk.children),
      })
    }
  }
  return raw
}

async function buildWithEsbuild(
  config: BundlerConfig,
  warnings: Array<string>,
): Promise<Array<EmittedChunk>> {
  const esbuild = await import('esbuild')
  const ssr = config.env === 'ssr'
  let result
  try {
    result = await esbuild.build({
      absWorkingDir: config.root,
      entryPoints: { entry: config.entry },
      outdir: config.outDir,
      bundle: true,
      splitting: true,
      format: 'esm',
      platform: ssr ? 'node' : 'browser',
      target: 'esnext',
      outExtension: { '.js': '.mjs' },
      chunkNames: '[name]-[hash]',
      jsx: 'automatic',
      jsxDev: config.mode === 'development',
      jsxImportSource: config.jsxImportSource,
      minify: config.minify,
      sourcemap: config.sourcemap,
      metafile: true,
      logLevel: 'silent',
      define: ssr
        ? {}
        : { 'process.env.NODE_ENV': JSON.stringify(config.mode) },
      external: ssr ? ['react', 'react/*', 'react-dom', 'react-dom/*'] : [],
      // Bundled CommonJS dependencies require the external React
      banner: ssr
        ? {
            js: `import { createRequire as __createRequire } from 'node:module'
const require = __createRequire(import.meta.url)`,
          }
        : {},
      plugins: config.plugin ? [config.plugin() as never] : [],
    })
  } catch (error) {
    const failure = error as {
      errors?: Array<EsbuildMessage>
      warnings?: Array<EsbuildMessage>
    }
    warnings.push(...(failure.warnings ?? []).map(esbuildText))
    throw new BuildError(
      'esbuild',
      failure.errors?.map(esbuildText) ?? [errorMessage(error)],
      warnings,
    )
  }
  warnings.push(...result.warnings.map(esbuildText))
  const entryPoint = path.relative(config.root, config.entry)
  const relative = (file: string) =>
    path.relative(config.outDir, path.join(config.root, file))
  return Object.entries(result.metafile?.outputs ?? {})
    .filter(([file]) => file.endsWith('.mjs'))
    .map(([file, output]) => ({
      fileName: relative(file),
      // Dynamically imported modules are entry points too
      isEntry: output.entryPoint === entryPoint,
      imports: output.imports
        .filter((item) => !item.external && item.kind === 'import-statement')
        .map((item) => relative(item.path)),
      dynamicImports: output.imports
        .filter((item) => !item.external && item.kind === 'dynamic-import')
        .map((item) => relative(item.path)),
    }))
}

/** Error or warning messages of a compilation's stats. */
export function statsMessages(
  items: Array<{ message: string; moduleName?: string }> | undefined,
): Array<string> {
  return (items ?? []).map(statsMessage)
}

export interface DescribeBuildInput {
  bundler: Bundler
  env: BuildEnv
  mode: BuildMode
  /** Whether the build minified its output (default: `mode === 'production'`). */
  minify?: boolean
  /**
   * Whether the chunks are ES modules (the bundler's `output.module`).
   * Default `true`, as Vite and esbuild always emit and the harness
   * configures webpack and Rspack. A client run loads an ES module entry
   * with `import()`, and a classic script entry with the chunks of its group
   * with `<script>` tags.
   */
  esModules?: boolean
  /** App root on disk. */
  root: string
  /** Absolute output directory the chunk file names are relative to. */
  outDir: string
  chunks: Array<EmittedChunk>
  /** Reads the source map of each chunk (`<file>.map`). */
  sourcemap?: boolean
  /**
   * webpack and Rspack: the modules of the output (`recordParsedModules`),
   * the evidence of which modules the check covers (see
   * `checkDanglingNames`).
   */
  parsedModules?: ParsedModules
  warnings: Array<string>
  consoleMessages: Array<string>
  duration: number
  dispose: () => Promise<void>
  /**
   * For an entry that exports nothing (an application entry): the global
   * its module assigns the exports `run()` gives the script as `entry` to.
   */
  entryGlobal?: string
}

/**
 * Describes what a build emitted (one entry chunk, the chunks loaded with it
 * and the ones loaded on demand) and how to run it. Also for builds the
 * harness did not run, e.g. one environment of a framework's
 * multi-environment build.
 */
export async function describeBuild(
  input: DescribeBuildInput,
): Promise<BuildResult> {
  const { bundler } = input
  const emitted = new Set(input.chunks.map((raw) => raw.fileName))
  const chunks: Array<Chunk> = []
  for (const raw of input.chunks) {
    const file = path.join(input.outDir, raw.fileName)
    chunks.push({
      ...raw,
      // Externals (e.g. `react` in SSR builds) are not chunks
      imports: raw.imports.filter((name) => emitted.has(name)),
      dynamicImports: raw.dynamicImports.filter((name) => emitted.has(name)),
      code: await readFile(file, 'utf8'),
      ...(input.sourcemap && {
        map: JSON.parse(await readFile(`${file}.map`, 'utf8')) as SourceMap,
      }),
    })
  }
  if (
    input.env === 'client' &&
    input.mode === 'production' &&
    bundler !== 'esbuild'
  ) {
    await checkDanglingNames(bundler, chunks, {
      root: input.root,
      parsedModules: input.parsedModules,
    })
  }
  const entries = chunks.filter((chunk) => chunk.isEntry)
  if (entries.length !== 1) {
    throw new Error(
      `${bundler}: expected one entry chunk, got ${entries.map((chunk) => chunk.fileName).join(', ') || 'none'}`,
    )
  }
  const entry = entries[0]!
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const eager = new Set<string>()
  const visit = (fileName: string) => {
    if (eager.has(fileName)) {
      return
    }
    eager.add(fileName)
    for (const imported of byName.get(fileName)?.imports ?? []) {
      visit(imported)
    }
  }
  visit(entry.fileName)

  const locate = (marker: string | RegExp) => {
    const found = chunks
      .filter((chunk) =>
        typeof marker === 'string'
          ? chunk.code.includes(marker)
          : marker.test(chunk.code),
      )
      .map((chunk) => chunk.fileName)
    return {
      eager: found.filter((fileName) => eager.has(fileName)),
      lazy: found.filter((fileName) => !eager.has(fileName)),
    }
  }

  return {
    bundler,
    env: input.env,
    root: input.root,
    outDir: input.outDir,
    chunks,
    entry,
    eager: [...eager],
    lazy: [...emitted].filter((fileName) => !eager.has(fileName)),
    warnings: input.warnings,
    consoleMessages: input.consoleMessages,
    duration: input.duration,
    locate,
    where: (marker) => {
      const found = locate(marker)
      if (found.eager.length && found.lazy.length) {
        return 'eager+lazy'
      }
      if (found.eager.length) {
        return 'eager'
      }
      return found.lazy.length ? 'lazy' : 'nowhere'
    },
    run: (script = '') =>
      input.env === 'client'
        ? runInBrowser({
            outDir: input.outDir,
            entry,
            // A classic script entry needs the chunks of its group loaded
            // with it, as the bundler's HTML page would load them.
            scripts: [...entry.imports, entry.fileName],
            esModules: input.esModules ?? true,
            script,
            entryGlobal: input.entryGlobal,
          })
        : runInNode({
            entryFile: path.join(input.outDir, entry.fileName),
            mode: input.mode,
            script,
            entryGlobal: input.entryGlobal,
          }),
    dispose: input.dispose,
  }
}

/**
 * Throws a `DanglingNameError` when production client chunks read a name
 * that is neither declared, imported nor a global of the browser
 * (`clientGlobals` of `known-globals.ts`: no Node-only global such as
 * `process` or `Buffer`) (user ruling "Dead-code references, widened",
 * 2026-10-17: a dangling name that survives into a production client bundle
 * is a bug; one in code the bundler deletes is fine). A read that a `typeof`
 * check of the name guards is allowed (see `unboundNames`).
 * esbuild is not checked: it is no supported production bundler of the
 * ruling.
 *
 * Every chunk is checked as the build emitted it, minified or not: that is
 * the artifact the configuration ships (SPEC G8).
 *
 * Which modules are checked (ruling "dangling-name attribution", amended
 * 2026-10-20; coupling N19, RULES-AUDIT R11): the ones the compilers under
 * test produced or changed in that build, attributed from the build's own
 * public evidence (`ParsedModules`: every module's code after the build's
 * transforms, recorded through the bundler's hooks), never from the
 * printed layout of the output (module headers, which minified output has
 * not) and never from who transformed a module (a compiler may be a
 * built-in transform). A name the chunk reads free is attributed to the
 * modules whose code after the transforms reads it free:
 * - a module of the app (a file of the build's root) or one without a file
 *   (virtual and support modules): it counts;
 * - a dependency's module the build changed (its code after the
 *   transforms differs from its file on disk): it counts when the module
 *   reads the name free while its original source does not (the
 *   transforms lost a binding or added a read); a name the original
 *   already reads free and binds nowhere is valid third-party JavaScript
 *   (e.g. seroval's `const RETURN = () => T`, used through
 *   `RETURN.toString()`);
 * - a dependency's module the build did not change: out of scope.
 * A name no module reads free is the bundler's when a module binds it (it
 * dropped a binding the transforms left in place, e.g. Rspack 2.2.7 and
 * the import bindings the kept unused code of a concatenated module reads:
 * out of scope); when no module binds it either, code outside the modules
 * (a bundle-level hook) introduced it, and it counts. Nothing is excepted
 * per package or by name. Without evidence, every free read counts.
 */
async function checkDanglingNames(
  bundler: Exclude<Bundler, 'esbuild'>,
  chunks: Array<Chunk>,
  evidence: ModuleEvidence,
) {
  const [{ unboundReads, nameReads }, { clientGlobals }] = await Promise.all([
    import('./validate-module'),
    import('./known-globals'),
  ])
  /** The original source on disk of each module, by resource (`undefined`: no file). */
  const originals = new Map<string, Promise<string | undefined>>()
  const originalOf = (resource: string) => {
    let original = originals.get(resource)
    if (!original) {
      original = readFile(resource, 'utf8').catch(() => undefined)
      originals.set(resource, original)
    }
    return original
  }
  const scope: ScopeEvidence = {
    root: evidence.root,
    parsedModules: evidence.parsedModules,
    originalOf,
    readsOf: (source) => {
      try {
        return nameReads(source)
      } catch {
        // A source the parser rejects gives no evidence
        return undefined
      }
    },
  }
  const dangling: Record<string, Array<string>> = {}
  /** Whether each name counts (one decision per build). */
  const decided = new Map<string, Promise<boolean>>()
  for (const chunk of chunks) {
    const names: Array<string> = []
    for (const name of unboundReads(chunk.code).keys()) {
      if (clientGlobals.has(name)) {
        continue
      }
      let counts = decided.get(name)
      if (!counts) {
        counts = nameCounts(name, scope)
        decided.set(name, counts)
      }
      if (await counts) {
        names.push(name)
      }
    }
    if (names.length > 0) {
      dangling[chunk.fileName] = names
    }
  }
  if (Object.keys(dangling).length > 0) {
    throw new DanglingNameError(bundler, dangling)
  }
}

/**
 * Whether a name a chunk reads free is a defect (see `checkDanglingNames`):
 * attributed to the modules whose code after the build's transforms reads
 * it free.
 */
async function nameCounts(name: string, scope: ScopeEvidence) {
  const parsed = scope.parsedModules
  if (!parsed) {
    // No evidence of the modules
    return true
  }
  const readers: Array<string> = []
  let bound = false
  for (const resource of parsed.modules) {
    const code =
      parsed.transformed.get(resource) ?? (await scope.originalOf(resource))
    if (code === undefined || !code.includes(name)) {
      continue
    }
    const reads = scope.readsOf(code)
    if (!reads || reads.unbound.has(name)) {
      readers.push(resource)
    }
    if (reads?.bound.has(name)) {
      bound = true
    }
  }
  if (readers.length === 0) {
    // The bundler dropped a binding, or a bundle-level hook added the read
    return !bound
  }
  for (const resource of readers) {
    if (await countsAsDangling(name, resource, scope)) {
      return true
    }
  }
  return false
}

interface ModuleEvidence {
  /** The build's context (the app). */
  root: string
  /** The modules of the output (`recordParsedModules`, `recordViteModules`). */
  parsedModules?: ParsedModules
}

interface ScopeEvidence extends ModuleEvidence {
  originalOf: (resource: string) => Promise<string | undefined>
  readsOf: (source: string) => NameReads | undefined
}

/** What a module reads (`nameReads` of `validate-module.ts`). */
interface NameReads {
  bound: Set<string>
  unbound: Map<string, Array<number>>
}

/**
 * Whether a free read of `name` in the code of the module `resource` is a
 * defect (see `checkDanglingNames`).
 */
async function countsAsDangling(
  name: string,
  resource: string | undefined,
  scope: ScopeEvidence,
) {
  if (resource === undefined || !scope.parsedModules) {
    // No evidence of the module
    return true
  }
  const original = await scope.originalOf(resource)
  if (original === undefined) {
    // No file: a virtual or support module
    return true
  }
  const relative = path.relative(scope.root, resource)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    // A module of the app
    return true
  }
  const transformed = scope.parsedModules.transformed.get(resource)
  if (transformed === undefined) {
    // A dependency the build did not change: out of scope
    return false
  }
  const after = scope.readsOf(transformed)
  const before = scope.readsOf(original)
  if (!after || !before) {
    return true
  }
  // Free after the transforms, and not already free in the original
  return (
    after.unbound.has(name) &&
    !(before.unbound.has(name) && !before.bound.has(name))
  )
}

/**
 * The modules of a webpack or Rspack build's output, recorded by
 * `recordParsedModules`: the evidence the dangling-name check of
 * `describeBuild` reads (`parsedModules`).
 */
export interface ParsedModules {
  /** Resource path of each module of the output, by module id. */
  resourceById: Map<string, string>
  /** Every module of the build, by resource path (or id, without a file). */
  modules: Set<string>
  /**
   * The code of each module whose code after the build's transforms (every
   * loader or transform hook, the bundler's built-in ones included) differs
   * from its file on disk, by resource path: the build changed it. (The
   * code of the others is their file.)
   */
  transformed: Map<string, string>
}

interface RecordedModule {
  resource?: string
  originalSource?: () => { source: () => string | Buffer } | null | undefined
}

interface RecordingCompilation {
  hooks: {
    finishModules: {
      tap: (
        name: string,
        callback: (modules: Iterable<RecordedModule>) => void,
      ) => void
    }
  }
}

interface RecordingCompiler {
  hooks: {
    thisCompilation: {
      tap: (
        name: string,
        callback: (compilation: RecordingCompilation) => void,
      ) => void
    }
    done: {
      tap: (
        name: string,
        callback: (stats: {
          toJson: (options: Record<string, unknown>) => {
            modules?: Array<{
              id?: string | number | null
              nameForCondition?: string | null
            }>
          }
        }) => void,
      ) => void
    }
  }
}

/**
 * Records a module's code after the build's transforms into `parsed`: every
 * module, and the code of the ones that differ from their file on disk.
 */
function recordModule(parsed: ParsedModules, resource: string, code: string) {
  parsed.modules.add(resource)
  let original: string | undefined
  try {
    original = readFileSync(resource, 'utf8')
  } catch {
    // No file: a virtual module
  }
  if (original !== code) {
    parsed.transformed.set(resource, code)
  }
}

/**
 * A webpack or Rspack plugin recording the evidence of a production client
 * build's dangling-name check into `parsed` (`ParsedModules`), through the
 * bundler's public hooks: each module's code after its loaders, the
 * bundler's built-in ones included (`finishModules`). It changes nothing
 * in the build.
 */
export function recordParsedModules(parsed: ParsedModules) {
  const name = 'test:record-parsed-modules'
  return {
    name,
    apply(compiler: RecordingCompiler) {
      compiler.hooks.thisCompilation.tap(name, (compilation) => {
        compilation.hooks.finishModules.tap(name, (modules) => {
          for (const module of modules) {
            const source = module.originalSource?.()?.source()
            if (module.resource && source !== undefined) {
              recordModule(parsed, module.resource, String(source))
            }
          }
        })
      })
      compiler.hooks.done.tap(name, (stats) => {
        const { modules = [] } = stats.toJson({
          all: false,
          modules: true,
          ids: true,
        })
        for (const module of modules) {
          if (module.id != null && module.nameForCondition) {
            parsed.resourceById.set(String(module.id), module.nameForCondition)
          }
        }
      })
    },
  }
}

/**
 * A Vite plugin recording the evidence of a production client build's
 * dangling-name check into `parsed` (`ParsedModules`), through Vite's public
 * hooks: each module's code after every other transform hook. It changes
 * nothing in the build.
 */
export function recordViteModules(
  parsed: ParsedModules,
  options: { environment?: string } = {},
) {
  return {
    name: 'test:record-vite-modules',
    // One environment's modules only, when given (e.g. `client`)
    applyToEnvironment: (environment: { name: string }) =>
      options.environment === undefined ||
      environment.name === options.environment,
    transform: {
      order: 'post' as const,
      handler(code: string, id: string) {
        recordModule(parsed, id.replace(/[?#].*$/, ''), code)
        return null
      },
    },
  }
}

/** An empty `ParsedModules`, for `recordParsedModules` to fill. */
export function parsedModules(): ParsedModules {
  return { resourceById: new Map(), modules: new Set(), transformed: new Map() }
}

/**
 * The segments of a source map that carry a name (`names`), with the
 * original position each maps to: `source` as the map names it, `line`
 * 1-based, `column` 0-based (source map columns).
 */
export function namedSegments(
  map: SourceMap,
): Array<{ name: string; source: string; line: number; column: number }> {
  const base64 =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const segments: Array<{
    name: string
    source: string
    line: number
    column: number
  }> = []
  // Running values of the source index, line, column and name index.
  const state = [0, 0, 0, 0]
  for (const line of map.mappings.split(';')) {
    for (const segment of line.split(',')) {
      if (!segment) {
        continue
      }
      const fields: Array<number> = []
      let value = 0
      let shift = 0
      for (const char of segment) {
        const digit = base64.indexOf(char)
        value += (digit & 31) << shift
        if (digit & 32) {
          shift += 5
        } else {
          fields.push(value & 1 ? -(value >>> 1) : value >>> 1)
          value = 0
          shift = 0
        }
      }
      // fields[0] is the generated column.
      for (let index = 1; index < fields.length; index++) {
        state[index - 1]! += fields[index]!
      }
      if (fields.length === 5) {
        segments.push({
          name: map.names[state[3]!]!,
          source: map.sources[state[0]!]!,
          line: state[1]! + 1,
          column: state[2]!,
        })
      }
    }
  }
  return segments
}

/** A position in an original source file, according to a source map. */
export interface OriginalPosition {
  /** The source as the source map names it. */
  source: string
  /**
   * The source file relative to the app root, without the query of a
   * virtual module id (`source` keeps it).
   */
  file: string
  /** 1-based. */
  line: number
  /** 1-based. */
  column: number
}

/**
 * Where the innermost frame of `stack` (an error stack of the build's
 * output, e.g. returned by a `run()` script) that lies in a chunk of `build`
 * comes from, according to the chunk's emitted source map (`sourcemap`
 * builds). `undefined` when no frame lies in a chunk, or the map maps none
 * of that frame's line.
 */
export function originalFrameOf(
  build: Pick<BuildResult, 'root' | 'outDir' | 'chunks'>,
  stack: string,
): OriginalPosition | undefined {
  for (const [, location, line, column] of stack.matchAll(
    /((?:file:\/\/|https?:\/\/[^/\s()]+)?\/[^\s()]+?):(\d+):(\d+)/g,
  )) {
    // A client run serves the output directory at the page's origin.
    const file = location!.startsWith('file:')
      ? fileURLToPath(location!)
      : /^https?:/.test(location!)
        ? path.join(
            build.outDir,
            decodeURIComponent(new URL(location!).pathname),
          )
        : location!
    const chunk = build.chunks.find(
      (candidate) => path.join(build.outDir, candidate.fileName) === file,
    )
    if (!chunk) {
      continue
    }
    if (!chunk.map) {
      throw new Error(
        `${chunk.fileName} has no source map (build with sourcemap)`,
      )
    }
    const origin = new NodeSourceMap(
      chunk.map as ConstructorParameters<typeof NodeSourceMap>[0],
    ).findOrigin(Number(line), Number(column))
    if (!('fileName' in origin)) {
      return undefined
    }
    // webpack and Rspack name sources `webpack://<namespace>/<path from the
    // root>`; the others relative to the map.
    const source = origin.fileName.split('?')[0]!
    const webpackSource = /^webpack:\/\/[^/]*\/(.*)$/.exec(source)
    const absolute = webpackSource
      ? path.resolve(build.root, webpackSource[1]!)
      : path.resolve(path.dirname(file), source)
    return {
      source: origin.fileName,
      file: path.relative(build.root, absolute),
      line: origin.lineNumber,
      column: origin.columnNumber,
    }
  }
  return undefined
}

/** Runs a server (SSR) entry in a child Node process. */
async function runInNode(input: {
  entryFile: string
  mode: BuildMode
  script: string
  entryGlobal?: string
}): Promise<RunResult> {
  const program = `import { format } from 'node:util'
const logs = []
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => { logs.push(format(...args)) }
}
const entryModule = await import(${JSON.stringify(pathToFileURL(input.entryFile).href)})
const entry = ${input.entryGlobal ? `globalThis[${JSON.stringify(input.entryGlobal)}]` : 'entryModule'}
const result = await (async () => { ${input.script} })()
process.stdout.write(JSON.stringify({ result, logs }))
process.exit(0)
`
  try {
    // In a child process that never outlives the test worker (run-node.ts)
    const { stdout } = await runNodeProgram(program, {
      cwd: path.dirname(input.entryFile),
      env: { ...process.env, NODE_ENV: input.mode },
    })
    return JSON.parse(stdout) as RunResult
  } catch (error) {
    const failure = error as { stderr?: string }
    throw new Error(
      `Running ${input.entryFile} failed:\n${failure.stderr || errorMessage(error)}`,
    )
  }
}

/** The page a client run starts from (`/`), before the entry loads. */
const harnessPage =
  '<!doctype html><html><head></head><body><div id="root"></div></body></html>'

const contentTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
}

/**
 * Serves a build's output directory over HTTP on a free local port, at the
 * root of the origin (the bundlers' default public path), and the harness
 * page at `/`.
 */
async function serveOutput(directory: string) {
  const outDir = path.resolve(directory)
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url ?? '/', 'http://localhost').pathname,
    )
    if (pathname === '/') {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(harnessPage)
      return
    }
    const file = path.join(outDir, pathname)
    if (!file.startsWith(outDir + path.sep)) {
      response.writeHead(403).end()
      return
    }
    readFile(file).then(
      (body) => {
        response.writeHead(200, {
          'content-type':
            contentTypes[path.extname(file)] ?? 'application/octet-stream',
        })
        response.end(body)
      },
      () => {
        response.writeHead(404).end()
      },
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

/**
 * Runs a client entry in a page of a real browser (headless Chromium,
 * `browser.ts`): the output directory is served over HTTP, the page loads
 * the entry (an ES module with `import()`, a classic script and the chunks
 * of its group with `<script>` tags), then runs the script. Errors the page
 * does not catch fail the run.
 */
async function runInBrowser(input: {
  outDir: string
  entry: Chunk
  scripts: Array<string>
  esModules: boolean
  script: string
  entryGlobal?: string
}): Promise<RunResult> {
  const { openPage } = await import('./browser')
  const server = await serveOutput(input.outDir)
  const urlOf = (fileName: string) =>
    new URL(fileName.split(path.sep).join('/'), server.url).href
  let page: BrowserPage | undefined
  try {
    page = await openPage(server.url)
    const logs: Array<string> = []
    const uncaught: Array<string> = []
    page.page.on('console', (message) => {
      logs.push(message.text())
    })
    page.page.on('pageerror', (error) => {
      uncaught.push(error.stack ?? error.message)
    })
    const load = input.esModules
      ? `const entryModule = await import(${JSON.stringify(urlOf(input.entry.fileName))})`
      : `for (const src of ${JSON.stringify(input.scripts.map(urlOf))}) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = resolve
    script.onerror = () => reject(new Error('could not load ' + src))
    document.head.append(script)
  })
}
const entryModule = undefined`
    let outcome: string
    try {
      outcome = await page.page.evaluate(`(async () => {
${load}
const entry = ${input.entryGlobal ? `globalThis[${JSON.stringify(input.entryGlobal)}]` : 'entryModule'}
const result = await (async () => { ${input.script} })()
return JSON.stringify({ result, html: document.body.innerHTML })
})()`)
    } catch (error) {
      throw new Error(
        `Running ${input.entry.fileName} in Chromium failed:\n${[errorMessage(error), ...uncaught].join('\n')}`,
      )
    }
    if (uncaught.length > 0) {
      throw new Error(
        `Running ${input.entry.fileName} in Chromium threw errors the page did not catch:\n${uncaught.join('\n')}`,
      )
    }
    return { ...(JSON.parse(outcome) as Omit<RunResult, 'logs'>), logs }
  } finally {
    await page?.close()
    await server.close()
  }
}

/**
 * Options of Rspack's SWC loader for a language: `.ts` files are parsed
 * without JSX (`<T>(x) => x` is a generic arrow there), as Rsbuild does.
 */
function swcOptions(
  development: boolean,
  lang: 'ts' | 'tsx' | 'jsx',
  importSource: string,
) {
  return {
    jsc: {
      parser:
        lang === 'jsx'
          ? { syntax: 'ecmascript', jsx: true }
          : { syntax: 'typescript', tsx: lang === 'tsx' },
      target: 'esnext',
      transform: { react: { runtime: 'automatic', development, importSource } },
    },
  }
}

/**
 * Runs a build the way a build command does (`NODE_ENV` set to the mode by
 * default, which decides e.g. the JSX runtime and the `development` export
 * condition; `null` unsets it) and records `console.warn`/`console.error`
 * output. An error no one handles while the build runs fails the build: a
 * bundler that loses a plugin's error (e.g. a throw in a hook Rspack calls
 * without catching it) would otherwise never finish the build, and the test
 * would wait for its timeout.
 */
export async function withBuildEnvironment<T>(
  buildNodeEnv: string | null,
  messages: Array<string>,
  run: () => Promise<T>,
): Promise<T> {
  const nodeEnv = process.env.NODE_ENV
  if (buildNodeEnv === null) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = buildNodeEnv
  }
  const original = { warn: console.warn, error: console.error }
  console.warn = (...args: Array<unknown>) => {
    messages.push(format(...args))
    original.warn.apply(console, args)
  }
  console.error = (...args: Array<unknown>) => {
    messages.push(format(...args))
    original.error.apply(console, args)
  }
  let onUnhandled!: (error: unknown) => void
  const unhandled = new Promise<never>((_, reject) => {
    onUnhandled = (error) => {
      reject(
        new Error(
          `the build failed with an error no one handled: ${errorMessage(error)}`,
          { cause: error },
        ),
      )
    }
  })
  process.on('unhandledRejection', onUnhandled)
  process.on('uncaughtException', onUnhandled)
  try {
    return await Promise.race([run(), unhandled])
  } finally {
    process.off('unhandledRejection', onUnhandled)
    process.off('uncaughtException', onUnhandled)
    console.warn = original.warn
    console.error = original.error
    if (nodeEnv === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = nodeEnv
    }
  }
}

/** What the harness reads of a webpack or Rspack stats JSON. */
export interface StatsJson {
  chunks?: Array<{
    id?: string | number
    files?: Array<string>
    entry?: boolean
    siblings?: Array<string | number>
    children?: Array<string | number>
  }>
  entrypoints?: Record<string, { chunks?: Array<string | number> }>
  errors?: Array<{ message: string; moduleName?: string }>
  warnings?: Array<{ message: string; moduleName?: string }>
}

interface WebpackStats {
  toJson: (options: Record<string, unknown>) => StatsJson
}

interface WebpackCompiler {
  run: (callback: (error: Error | null, stats?: WebpackStats) => void) => void
  close: (callback: () => void) => void
}

function statsMessage(item: { message: string; moduleName?: string }) {
  // Rspack colours messages when the terminal supports it
  const message = stripAnsi(item.message)
  return item.moduleName ? `${item.moduleName}: ${message}` : message
}

interface EsbuildMessage {
  text: string
  location?: { file: string; line: number; column: number } | null
}

/** An esbuild message as esbuild prints it: `file:line:column: text`. */
function esbuildText(message: EsbuildMessage) {
  return message.location
    ? `${message.location.file}:${message.location.line}:${message.location.column}: ${message.text}`
    : message.text
}

function errorMessage(error: unknown) {
  return stripAnsi(error instanceof Error ? error.message : String(error))
}

/** `text` without its terminal colour codes. */
export function stripAnsi(text: string) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}
