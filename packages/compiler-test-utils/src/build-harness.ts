/**
 * Real-build harness for goal tests whose outcome the bundler decides: which
 * chunk code ends up in, what tree-shaking drops, what side-effect hints
 * change. Writes a small app to disk, builds it with one of the bundlers the
 * router plugin supports, describes the emitted chunks (entry, eager, lazy)
 * and runs the output in a separate Node process (with a jsdom document for
 * client builds).
 *
 * Plugin-agnostic: the caller supplies the plugin of each build, and the
 * directory its apps live in (where their imports resolve).
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { SourceMap as NodeSourceMap, createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format } from 'node:util'
import { runNodeProgram } from './run-node'

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
   * relative to the app root (e.g. a route file linked from elsewhere).
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
   * Defaults to `mode === 'production'`, like a real app build. webpack and
   * Rspack only drop unused code inside a kept module when minifying.
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
   * Imports the entry in a separate Node process and returns the JSON
   * value `script` returns. `script` is an async function body with the
   * entry's exports in scope as `entry` (and a jsdom `document`/`window` as
   * globals for client builds).
   */
  run: (script?: string) => Promise<RunResult>
  /** Removes the app directory. */
  dispose: () => Promise<void>
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
const require = createRequire(import.meta.url)

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
  const dispose = () => rm(root, { recursive: true, force: true })
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
      await symlink(path.join(root, target), path.join(root, link))
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
    minify: target.minify ?? mode === 'production',
    sourcemap: target.sourcemap ?? false,
    plugin: plugin && (() => plugin({ root, env, mode })),
    jsxImportSource: target.jsxImportSource ?? 'react',
    sourceRules: target.sourceRules,
    conditions: target.conditions ?? [],
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
    root,
    outDir: config.outDir,
    chunks: output,
    sourcemap: config.sourcemap,
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
      plugins: config.plugin ? [config.plugin() as never] : [],
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
    throw new BuildError('vite', [...errors, errorMessage(error)], warnings)
  }
  const chunks: Array<EmittedChunk> = []
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!('output' in output)) {
      throw new Error('Unexpected watcher from vite build')
    }
    chunks.push(...chunksOfBundle(output.output))
  }
  return chunks
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
      ? [
          {
            test: /\.[cm]?tsx?$/,
            include: config.root,
            loader: 'builtin:swc-loader',
            options: swcOptions(development, true, config.jsxImportSource),
            type: 'javascript/auto',
          },
          {
            test: /\.[cm]?jsx$/,
            include: config.root,
            loader: 'builtin:swc-loader',
            options: swcOptions(development, false, config.jsxImportSource),
            type: 'javascript/auto',
          },
        ]
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
    plugins: config.plugin ? [config.plugin()] : [],
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
  /** App root on disk. */
  root: string
  /** Absolute output directory the chunk file names are relative to. */
  outDir: string
  chunks: Array<EmittedChunk>
  /** Reads the source map of each chunk (`<file>.map`). */
  sourcemap?: boolean
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
      runEntry({
        entryFile: path.join(input.outDir, entry.fileName),
        env: input.env,
        mode: input.mode,
        script,
        entryGlobal: input.entryGlobal,
      }),
    dispose: input.dispose,
  }
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
    /((?:file:\/\/)?\/[^\s()]+?):(\d+):(\d+)/g,
  )) {
    const file = location!.startsWith('file:')
      ? fileURLToPath(location!)
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

const jsdomUrl = pathToFileURL(require.resolve('jsdom')).href

/** Installs a jsdom window as the global scope before the entry loads. */
const domSetup = `const { JSDOM } = await import(${JSON.stringify(jsdomUrl)})
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
for (const key of Object.getOwnPropertyNames(dom.window)) {
  if (!(key in globalThis)) {
    Object.defineProperty(globalThis, key, { configurable: true, get: () => dom.window[key] })
  }
}
for (const key of ['window', 'self', 'document', 'navigator', 'location']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
}
`

async function runEntry(input: {
  entryFile: string
  env: BuildEnv
  mode: BuildMode
  script: string
  entryGlobal?: string
}): Promise<RunResult> {
  const client = input.env === 'client'
  const program = `import { format } from 'node:util'
const logs = []
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => { logs.push(format(...args)) }
}
${client ? domSetup : ''}
const entryModule = await import(${JSON.stringify(pathToFileURL(input.entryFile).href)})
const entry = ${input.entryGlobal ? `globalThis[${JSON.stringify(input.entryGlobal)}]` : 'entryModule'}
const result = await (async () => { ${input.script} })()
process.stdout.write(JSON.stringify({ result, logs${client ? ', html: document.body.innerHTML' : ''} }))
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

function swcOptions(
  development: boolean,
  typescript: boolean,
  importSource: string,
) {
  return {
    jsc: {
      parser: typescript
        ? { syntax: 'typescript', tsx: true }
        : { syntax: 'ecmascript', jsx: true },
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
  location?: { file: string } | null
}

function esbuildText(message: EsbuildMessage) {
  return message.location
    ? `${message.location.file}: ${message.text}`
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
