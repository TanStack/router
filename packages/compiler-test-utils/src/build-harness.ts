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
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { format, promisify } from 'node:util'
import { onTestFinished } from 'vitest'

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
  /** Directory name prefix of the temporary app. */
  prefix?: string
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
  /** Creates the plugin (a Vite plugin array for Vite) of this build. */
  plugin?: (app: AppInfo) => unknown
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
const runNode = promisify(execFile)

const defaultPackageJson = { name: 'app', private: true, type: 'module' }

/** Bare imports kept external in SSR builds (resolved by Node at run time). */
const ssrExternal = /^(react|react-dom)(\/.*)?$/

/**
 * Writes an app to a temporary directory in `options.dir`, so that its
 * imports resolve from there. The directory is removed when the current test
 * finishes, or by `dispose()`.
 */
export async function createApp(options: AppOptions): Promise<App> {
  const root = await mkdtemp(
    path.join(options.dir, options.prefix ?? '.build-harness-'),
  )
  const dispose = () => rm(root, { recursive: true, force: true })
  try {
    onTestFinished(dispose)
  } catch {
    // Not inside a test: the caller disposes.
  }
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
  const { dir, files, packageJson, sideEffects, prefix, plugins, ...target } =
    options
  const app = await createApp({
    dir,
    files,
    packageJson,
    sideEffects,
    prefix: prefix ?? `.build-harness-${target.bundler}-`,
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
  plugin: (() => unknown) | undefined
}

interface RawChunk {
  fileName: string
  isEntry: boolean
  imports: Array<string>
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
    plugin: plugin && (() => plugin({ root, env, mode })),
  }
  const warnings: Array<string> = []
  const consoleMessages: Array<string> = []
  const started = performance.now()
  const output = await withBuildEnvironment(mode, consoleMessages, () =>
    builders[bundler](config, warnings),
  )
  const duration = performance.now() - started
  return describeOutput({
    config,
    bundler,
    output,
    warnings,
    consoleMessages,
    duration,
    dispose,
  })
}

const builders: Record<
  Bundler,
  (config: BundlerConfig, warnings: Array<string>) => Promise<Array<RawChunk>>
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
): Promise<Array<RawChunk>> {
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
      build: {
        ssr: config.env === 'ssr' ? config.entry : false,
        outDir: config.outDir,
        emptyOutDir: true,
        minify: config.minify,
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
  const chunks: Array<RawChunk> = []
  for (const output of Array.isArray(result) ? result : [result]) {
    if (!('output' in output)) {
      throw new Error('Unexpected watcher from vite build')
    }
    for (const item of output.output) {
      if (item.type === 'chunk') {
        chunks.push({
          fileName: item.fileName,
          isEntry: item.isEntry,
          imports: item.imports,
          dynamicImports: item.dynamicImports,
        })
      }
    }
  }
  return chunks
}

/** webpack and Rspack share the configuration and the stats format. */
async function buildWithWebpackApi(
  bundler: 'webpack' | 'rspack',
  config: BundlerConfig,
  warnings: Array<string>,
): Promise<Array<RawChunk>> {
  const ssr = config.env === 'ssr'
  const development = config.mode === 'development'
  // TypeScript and JSX of the app's own files: Rspack's built-in SWC
  // loader; webpack has none, so a small Oxc loader.
  const sourceRules =
    bundler === 'rspack'
      ? [
          {
            test: /\.[cm]?tsx?$/,
            include: config.root,
            loader: 'builtin:swc-loader',
            options: swcOptions(development, true),
            type: 'javascript/auto',
          },
          {
            test: /\.[cm]?jsx$/,
            include: config.root,
            loader: 'builtin:swc-loader',
            options: swcOptions(development, false),
            type: 'javascript/auto',
          },
        ]
      : [
          {
            test: /\.[cm]?(tsx?|jsx)$/,
            include: config.root,
            loader: oxcLoader,
            options: { development },
          },
        ]
  const options = {
    mode: config.mode,
    context: config.root,
    entry: { entry: config.entry },
    target: ssr ? 'node' : 'web',
    devtool: false,
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

  const json = stats.toJson({
    all: false,
    ids: true,
    chunks: true,
    chunkRelations: true,
    entrypoints: true,
    errors: true,
    warnings: true,
  })
  warnings.push(...(json.warnings ?? []).map(statsMessage))
  if (json.errors?.length) {
    throw new BuildError(bundler, json.errors.map(statsMessage), warnings)
  }

  const filesById = new Map<string | number, Array<string>>()
  for (const chunk of json.chunks ?? []) {
    filesById.set(
      chunk.id!,
      (chunk.files ?? []).filter((file) => file.endsWith('.mjs')),
    )
  }
  const filesOf = (ids: Iterable<string | number> | undefined) =>
    [...(ids ?? [])].flatMap((id) => filesById.get(id) ?? [])
  const entryChunkIds = new Set(json.entrypoints?.entry?.chunks ?? [])
  const raw: Array<RawChunk> = []
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
): Promise<Array<RawChunk>> {
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
      minify: config.minify,
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

async function describeOutput(input: {
  config: BundlerConfig
  bundler: Bundler
  output: Array<RawChunk>
  warnings: Array<string>
  consoleMessages: Array<string>
  duration: number
  dispose: () => Promise<void>
}): Promise<BuildResult> {
  const { bundler, config } = input
  const emitted = new Set(input.output.map((raw) => raw.fileName))
  const chunks: Array<Chunk> = []
  for (const raw of input.output) {
    chunks.push({
      ...raw,
      // Externals (e.g. `react` in SSR builds) are not chunks
      imports: raw.imports.filter((file) => emitted.has(file)),
      dynamicImports: raw.dynamicImports.filter((file) => emitted.has(file)),
      code: await readFile(path.join(config.outDir, raw.fileName), 'utf8'),
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
    env: config.env,
    root: config.root,
    outDir: config.outDir,
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
        entryFile: path.join(config.outDir, entry.fileName),
        env: config.env,
        mode: config.mode,
        script,
      }),
    dispose: input.dispose,
  }
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
}): Promise<RunResult> {
  const client = input.env === 'client'
  const program = `import { format } from 'node:util'
const logs = []
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  console[level] = (...args) => { logs.push(format(...args)) }
}
${client ? domSetup : ''}
const entry = await import(${JSON.stringify(pathToFileURL(input.entryFile).href)})
const result = await (async () => { ${input.script} })()
process.stdout.write(JSON.stringify({ result, logs${client ? ', html: document.body.innerHTML' : ''} }))
process.exit(0)
`
  try {
    const { stdout } = await runNode(
      process.execPath,
      ['--input-type=module', '--eval', program],
      {
        cwd: path.dirname(input.entryFile),
        env: { ...process.env, NODE_ENV: input.mode },
        maxBuffer: 64 * 1024 * 1024,
      },
    )
    return JSON.parse(stdout) as RunResult
  } catch (error) {
    const failure = error as { stderr?: string }
    throw new Error(
      `Running ${input.entryFile} failed:\n${failure.stderr || errorMessage(error)}`,
    )
  }
}

function swcOptions(development: boolean, typescript: boolean) {
  return {
    jsc: {
      parser: typescript
        ? { syntax: 'typescript', tsx: true }
        : { syntax: 'ecmascript', jsx: true },
      target: 'esnext',
      transform: { react: { runtime: 'automatic', development } },
    },
  }
}

/**
 * Runs a build the way a build command does (`NODE_ENV` set to the mode,
 * which decides e.g. the JSX runtime and the `development` export
 * condition) and records `console.warn`/`console.error` output.
 */
async function withBuildEnvironment<T>(
  mode: BuildMode,
  messages: Array<string>,
  run: () => Promise<T>,
): Promise<T> {
  const nodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = mode
  const original = { warn: console.warn, error: console.error }
  console.warn = (...args: Array<unknown>) => {
    messages.push(format(...args))
    original.warn.apply(console, args)
  }
  console.error = (...args: Array<unknown>) => {
    messages.push(format(...args))
    original.error.apply(console, args)
  }
  try {
    return await run()
  } finally {
    console.warn = original.warn
    console.error = original.error
    process.env.NODE_ENV = nodeEnv
  }
}

interface WebpackStats {
  toJson: (options: Record<string, unknown>) => {
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

function stripAnsi(text: string) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}
