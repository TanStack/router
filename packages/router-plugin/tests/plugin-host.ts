/**
 * Hosts the router plugin's code-splitter, generator and route HMR plugins
 * in process, the way a bundler calls them: compile a route file into its
 * route module and split chunks, follow their imports, and inspect an
 * emitted module. Re-exported by `regression-helpers.ts`.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { moduleLang } from '@tanstack/compiler-test-utils/module-linker'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { parseSync } from 'vite'
import { expect } from 'vitest'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterGeneratorPlugin } from '../src/core/router-generator-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import type { ModuleErrorOptions } from '@tanstack/compiler-test-utils/validate-module'
import type { Config, DeletableNodes } from '../src/core/config'
import type { TransformResult, UnpluginOptions } from 'unplugin'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** A framework the router plugin targets. */
export type TargetFramework = 'react' | 'solid' | 'vue'

export type CompileOptions = {
  /** Name of the route file; it is compiled as `/<filename>`. */
  filename?: string
  /**
   * Module id of the route file as a bundler passes it, instead of
   * `/<filename>`: e.g. under another project root, or a Windows path
   * (`C:/app/…` from Vite, `C:\\app\\…` from webpack and Rspack). The
   * route is registered under its forward-slash form.
   */
  moduleId?: string
  targetFramework?: TargetFramework
  /** Compile for the dev server: route HMR and the framework's HMR code. */
  hmr?: boolean
  /**
   * Route options removed from the output, as Start configures the client
   * (`['ssr', 'server', 'headers']`).
   */
  deleteNodes?: Array<DeletableNodes>
  /** Route id the route file is registered under. Default `/`. */
  routeId?: string
  /**
   * Router plugin options over the harness's, e.g. `codeSplittingOptions`
   * (`defaultBehavior`, `splitBehavior`; merged with `hmr` and
   * `deleteNodes`) or `plugin.hmr.style`.
   */
  pluginOptions?: Partial<Config>
  /**
   * The Vite command the plugin is configured for. Default `serve` with
   * `hmr`, else `build` (which the plugin takes for a production build).
   */
  command?: 'serve' | 'build'
  /**
   * Configure the plugins for webpack instead of Vite: their `webpack` hook
   * gets this compiler (see `webpackCompiler`) instead of their Vite
   * `configResolved` hook getting a Vite config.
   */
  webpackCompiler?: WebpackCompilerStub
}

/** What the plugins' `webpack(compiler)` hook can read of a compiler. */
export type WebpackCompilerStub = {
  options: { mode: 'development' | 'production'; plugins: Array<object> }
}

/**
 * The React Refresh webpack plugin (`@pmmmwh/react-refresh-webpack-plugin`)
 * as webpack's configuration lists it: an instance of `ReactRefreshPlugin`.
 */
class ReactRefreshPlugin {
  apply() {}
}

/**
 * A webpack development compiler whose configuration has the React Refresh
 * plugin (`refresh`) or no refresh plugin, the way a webpack or Rspack app
 * without React Refresh is configured.
 */
export function webpackCompiler(refresh: boolean): WebpackCompilerStub {
  return {
    options: {
      mode: 'development',
      plugins: refresh ? [new ReactRefreshPlugin()] : [],
    },
  }
}

/**
 * Configures plugins the way a bundler does before any transform: Vite's
 * `configResolved` with `vite`, or webpack's plugin hook with a compiler.
 */
function configurePlugins(
  plugins: Array<UnpluginOptions>,
  bundler: { vite: Record<string, unknown> } | { webpack: WebpackCompilerStub },
) {
  for (const plugin of plugins) {
    if ('webpack' in bundler) {
      plugin.webpack?.(bundler.webpack as never)
    } else {
      sync(
        hookHandler(plugin.vite?.configResolved)?.call(
          pluginContext,
          bundler.vite as never,
        ),
        'configResolved',
      )
    }
  }
}

/**
 * The id the harness compiles a route file under: an absolute path, as
 * bundlers pass module ids to plugins.
 */
export function routeModuleId(filename = 'route.tsx') {
  return normalizePath(path.resolve('/', filename))
}

/** Splits a module id or specifier into its path and its query. */
function splitQuery(id: string): [string, string | undefined] {
  const index = id.indexOf('?')
  return index === -1
    ? [id, undefined]
    : [id.slice(0, index), id.slice(index + 1)]
}

/** The handler of a plugin hook given as a function or as `{ handler }`. */
function hookHandler(
  hook: unknown,
): ((...args: Array<any>) => any) | undefined {
  if (typeof hook === 'function') {
    return hook as (...args: Array<any>) => any
  }
  if (hook && typeof hook === 'object' && 'handler' in hook) {
    return (hook as { handler: (...args: Array<any>) => any }).handler
  }
  return undefined
}

/** Whether `value` matches an unplugin hook filter pattern. */
function matchesPattern(pattern: unknown, value: string): boolean {
  if (pattern instanceof RegExp) {
    pattern.lastIndex = 0
    return pattern.test(value)
  }
  if (Array.isArray(pattern)) {
    return pattern.some((item) => matchesPattern(item, value))
  }
  if (pattern && typeof pattern === 'object') {
    const { include, exclude } = pattern as {
      include?: unknown
      exclude?: unknown
    }
    if (exclude !== undefined && matchesPattern(exclude, value)) {
      return false
    }
    return include === undefined || matchesPattern(include, value)
  }
  throw new Error(`unsupported hook filter: ${String(pattern)}`)
}

function passesFilter(hook: unknown, id: string, code?: string) {
  const filter =
    hook && typeof hook === 'object' && 'filter' in hook
      ? (hook.filter as { id?: unknown; code?: unknown } | undefined)
      : undefined
  return (
    (filter?.id === undefined || matchesPattern(filter.id, id)) &&
    (filter?.code === undefined ||
      code === undefined ||
      matchesPattern(filter.code, code))
  )
}

/** Fails on a hook result a synchronous harness cannot wait for. */
function sync<T>(result: T, hook: string): T {
  if (result instanceof Promise) {
    throw new Error(`the harness only drives synchronous ${hook} hooks`)
  }
  return result
}

/** The `this` of plugin hooks: warnings go to the console, like Vite's. */
const pluginContext = {
  warn: (message: unknown) => console.warn(message),
  error: (message: unknown) => {
    throw message instanceof Error ? message : new Error(String(message))
  },
}

/**
 * Imports and re-exports of a module, static or dynamic (`import()`), by
 * specifier, in source order (static ones first). `id` gives the module's
 * language.
 */
export function importRequests(code: string, id = 'module.tsx') {
  const { module } = parseSync(`module.${moduleLang(id)}`, code, {
    sourceType: 'module',
  })
  const requests: Array<{ specifier: string; dynamic: boolean }> = []
  for (const statement of module.staticImports) {
    requests.push({ specifier: statement.moduleRequest.value, dynamic: false })
  }
  for (const statement of module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.moduleRequest) {
        requests.push({ specifier: entry.moduleRequest.value, dynamic: false })
      }
    }
  }
  for (const dynamicImport of module.dynamicImports) {
    const source = code.slice(
      dynamicImport.moduleRequest.start,
      dynamicImport.moduleRequest.end,
    )
    // A string literal, or a template literal without substitutions.
    const literal = /^(?:(["'])([^"'\\]*)\1|`((?:[^`\\$]|\$(?!\{))*)`)$/.exec(
      source,
    )
    if (!literal) {
      throw new Error(`cannot follow the dynamic import ${source}`)
    }
    requests.push({ specifier: (literal[2] ?? literal[3])!, dynamic: true })
  }
  return requests
}

/**
 * What a bundler gets from compiling a route file with the code-splitter
 * plugin: the route module and every module its output imports, statically
 * or dynamically, that resolves to the route file or that a plugin resolves.
 */
export type RouteGraph = {
  /** Id of the route module. */
  id: string
  /** Code of each module, by id, in the order the imports reach them. */
  modules: Map<string, string>
  /** Whether a module is imported statically by some module, or only lazily. */
  importKinds: Map<string, 'static' | 'dynamic'>
  /** Resolves an import of an emitted module to an emitted module's id. */
  resolve: (specifier: string, importer: string) => string | undefined
}

export function compileRouteGraph(
  code: string,
  options: CompileOptions = {},
): RouteGraph {
  return createRouteGraphCompiler(options)(code)
}

/**
 * Creates one code-splitter plugin instance, configured like a bundler does,
 * and returns a function that compiles a version of the route file with it
 * (`compileRouteGraph`), as a dev server compiles each edit of the file.
 */
export function createRouteGraphCompiler(
  options: CompileOptions = {},
): (code: string) => RouteGraph {
  const {
    filename = 'route.tsx',
    targetFramework = 'react',
    hmr = false,
    deleteNodes,
    routeId = '/',
    pluginOptions = {},
    command = hmr ? 'serve' : 'build',
    webpackCompiler: compiler,
  } = options
  const id = options.moduleId ?? routeModuleId(filename)
  const context = createRouterPluginContext()
  context.routesByFile.set(normalizePath(id), { routeId })
  const created = createRouterCodeSplitterPlugin(
    {
      target: targetFramework,
      autoCodeSplitting: true,
      ...pluginOptions,
      codeSplittingOptions: {
        addHmr: hmr,
        deleteNodes,
        ...pluginOptions.codeSplittingOptions,
      },
    },
    context,
  )
  const plugins: Array<UnpluginOptions> = Array.isArray(created)
    ? created
    : [created]
  configurePlugins(
    plugins,
    compiler
      ? { webpack: compiler }
      : { vite: { root: process.cwd(), command, plugins: [] } },
  )

  const resolve = (specifier: string, importer: string) => {
    for (const plugin of plugins) {
      const hook = plugin.resolveId
      if (!hookHandler(hook) || !passesFilter(hook, specifier)) {
        continue
      }
      const resolved = sync(
        hookHandler(hook)!.call(pluginContext, specifier, importer, {}),
        'resolveId',
      )
      if (typeof resolved === 'string') {
        return resolved
      }
      if (resolved && typeof resolved === 'object' && 'id' in resolved) {
        return resolved.id as string
      }
    }
    const [request, query] = splitQuery(specifier)
    const importerPath = splitQuery(importer)[0]
    // Windows ids from webpack and Rspack use backslashes
    const paths = importerPath.includes('\\') ? path.win32 : path.posix
    let file: string
    if (/^(?:\/|[A-Za-z]:[\\/])/.test(request)) {
      file = request
    } else if (request.startsWith('./') || request.startsWith('../')) {
      file = paths.join(paths.dirname(importerPath), request)
    } else {
      return undefined
    }
    // Only modules of the route file are compiled; other files are stubs.
    if (normalizePath(file) !== normalizePath(id)) {
      return undefined
    }
    return query === undefined ? id : `${id}?${query}`
  }

  const load = (code: string, moduleId: string) => {
    for (const plugin of plugins) {
      const hook = plugin.load
      if (!hookHandler(hook) || !passesFilter(hook, moduleId)) {
        continue
      }
      const loaded = sync(
        hookHandler(hook)!.call(pluginContext, moduleId),
        'load',
      ) as string | { code: string } | null | undefined
      if (loaded != null) {
        return typeof loaded === 'string' ? loaded : loaded.code
      }
    }
    // Bundlers read a module id with a query from the file it names.
    if (splitQuery(moduleId)[0] === id) {
      return code
    }
    throw new Error(`no plugin loads ${moduleId}`)
  }

  const transform = (moduleId: string, source: string) => {
    let current = source
    for (const plugin of plugins) {
      const hook = plugin.transform
      if (
        !hookHandler(hook) ||
        !passesFilter(hook, moduleId, current) ||
        (plugin.transformInclude && !plugin.transformInclude(moduleId))
      ) {
        continue
      }
      const result = sync(
        hookHandler(hook)!.call(pluginContext, current, moduleId),
        'transform',
      ) as TransformResult | null | undefined
      if (result != null) {
        current = typeof result === 'string' ? result : result.code
      }
    }
    return current
  }

  return (code) => {
    const modules = new Map<string, string>()
    const importKinds = new Map<string, 'static' | 'dynamic'>()
    const queue = [id]
    while (queue.length > 0) {
      const moduleId = queue.shift()!
      if (modules.has(moduleId)) {
        continue
      }
      const output = transform(moduleId, load(code, moduleId))
      modules.set(moduleId, output)
      for (const { specifier, dynamic } of importRequests(output, moduleId)) {
        const target = resolve(specifier, moduleId)
        if (target === undefined) {
          continue
        }
        if (!dynamic) {
          importKinds.set(target, 'static')
        } else if (!importKinds.has(target)) {
          importKinds.set(target, 'dynamic')
        }
        queue.push(target)
      }
    }
    return { id, modules, importKinds, resolve }
  }
}

/** Route file each `compileRouteModules` result was compiled from. */
const routeSources = new WeakMap<object, { code: string; id: string }>()

/**
 * Compiles a route file through the code-splitter plugin (default groupings,
 * unless the route sets its own) and returns every module a bundler would
 * load for it, found by following the imports of the output, without
 * evaluating them.
 *
 * The modules are labelled `reference` (the route module), `shared` for a
 * module another one imports statically, and `lazy <n>` for a module only
 * imported lazily, in discovery order. Which route option loads which lazy
 * module is only known once the route is evaluated: `loadRoute` labels them
 * by option. `ids` gives the module id of each label.
 */
export function compileRouteModules(
  code: string,
  options: CompileOptions = {},
) {
  return labelRouteModules(code, compileRouteGraph(code, options))
}

/**
 * Labels the modules of a compiled route file (see `compileRouteModules`):
 * a lazy module is labelled `lazy <options>` after the route options whose
 * loading imports it (`lazyOptions`, by module id), else `lazy <n>`.
 */
export function labelRouteModules(
  code: string,
  graph: RouteGraph,
  lazyOptions: Map<string, Array<string>> = new Map(),
) {
  const modules: Record<string, string> = {}
  const ids: Record<string, string> = {}
  let unnamed = 0
  for (const [id, output] of graph.modules) {
    let label: string
    if (id === graph.id) {
      label = 'reference'
    } else if (graph.importKinds.get(id) === 'dynamic') {
      const options = lazyOptions.get(id)
      label = options ? `lazy ${options.sort().join('+')}` : `lazy ${++unnamed}`
    } else {
      label = 'shared'
    }
    if (label in modules) {
      label = `${label} (${id})`
    }
    modules[label] = output
    ids[label] = id
  }
  routeSources.set(modules, { code, id: graph.id })
  return { modules, ids, graph }
}

/**
 * Ids of the modules that load with the route module: the route module and
 * every emitted module it imports statically, directly or through another
 * one, in discovery order. (A module that a lazy chunk imports statically is
 * not one of them unless the route module reaches it too.)
 */
export function eagerModuleIds({ graph }: { graph: RouteGraph }) {
  const eager: Array<string> = []
  const queue = [graph.id]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (eager.includes(id)) {
      continue
    }
    eager.push(id)
    for (const { specifier, dynamic } of importRequests(
      graph.modules.get(id)!,
      id,
    )) {
      const target = dynamic ? undefined : graph.resolve(specifier, id)
      if (target !== undefined && graph.modules.has(target)) {
        queue.push(target)
      }
    }
  }
  return eager
}

/**
 * Sources that the modules loading with the route module (`eagerModuleIds`)
 * import or re-export statically, sorted: what loads with the entry,
 * whichever emitted module requests it.
 */
export function eagerImportSources(route: { graph: RouteGraph }) {
  return [
    ...new Set(
      eagerModuleIds(route).flatMap((id) =>
        importRequests(route.graph.modules.get(id)!, id)
          .filter(({ dynamic }) => !dynamic)
          .map(({ specifier }) => specifier),
      ),
    ),
  ].sort()
}

/** How many times `pattern` occurs across all emitted modules. */
export function countAcrossModules(
  modules: Record<string, string>,
  pattern: RegExp,
) {
  return Object.values(modules).reduce(
    (count, code) =>
      count + (code.match(new RegExp(pattern.source, 'g'))?.length ?? 0),
    0,
  )
}

/**
 * Asserts that every module is valid, reporting the errors by module name.
 * For the modules of `compileRouteModules`, the globals the route file reads
 * itself may be read by its modules too, and a name the route file binds
 * must not lose its binding in them (`source` of `getModuleErrors`). `jsx`
 * gives the JSX settings of the route's project (default: React's automatic
 * runtime), which decide what the modules' JSX pragmas mean.
 */
export async function expectValidModules(
  modules: Record<string, string>,
  options: Pick<ModuleErrorOptions, 'jsx'> = {},
) {
  const source = routeSources.get(modules)
  const filename = source ? `module.${moduleLang(source.id)}` : undefined
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code, filename, {
      source: source?.code,
      jsx: options.jsx,
    })
  }
  expect(errors).toEqual(
    Object.fromEntries(Object.keys(modules).map((name) => [name, []])),
  )
}

function moduleRecord(code: string, id = 'module.tsx') {
  return parseSync(`module.${moduleLang(id)}`, code, { sourceType: 'module' })
    .module
}

/** Sources a module imports, side-effect imports included, sorted. */
export function importSources(code: string) {
  return [
    ...new Set(
      moduleRecord(code).staticImports.map(
        (statement) => statement.moduleRequest.value,
      ),
    ),
  ].sort()
}

/**
 * Sources a module imports that name the compiled route file (`id`), with
 * or without a query: the modules the code splitter emits for it.
 */
export function routeModuleSources(code: string, id = routeModuleId()) {
  return importSources(code).filter((source) => splitQuery(source)[0] === id)
}

/**
 * The values a module imports from `source`, sorted: `default`, `*` for a
 * namespace import, or the imported name. Type-only specifiers are skipped.
 */
export function importedNames(code: string, source: string) {
  return moduleRecord(code)
    .staticImports.filter(
      (statement) => statement.moduleRequest.value === source,
    )
    .flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType)
        .map((entry) =>
          entry.importName.kind === 'Default'
            ? 'default'
            : entry.importName.kind === 'NamespaceObject'
              ? '*'
              : entry.importName.name!,
        ),
    )
    .sort()
}

/**
 * Value names a module exports (`default` for a default export), sorted.
 * `id` gives the module's language (TypeScript without JSX for `.ts`).
 */
export function exportedNames(code: string, id?: string) {
  return moduleRecord(code, id)
    .staticExports.flatMap((statement) =>
      statement.entries
        .filter((entry) => !entry.isType && entry.exportName.kind !== 'None')
        .map((entry) => entry.exportName.name ?? 'default'),
    )
    .sort()
}

/** Absolute, normalized path of a route file in the package's `src/routes`. */
export function routeFile(name: string) {
  return normalizePath(path.join(process.cwd(), `src/routes/${name}.tsx`))
}

function runTransform(plugin: UnpluginOptions, code: string, id: string) {
  const transform = plugin.transform
  if (!transform || typeof transform === 'function') {
    throw new Error('Expected object transform')
  }
  const result = transform.handler.call(pluginContext as never, code, id) as
    | TransformResult
    | null
    | undefined
  if (!result) {
    return null
  }
  return typeof result === 'string' ? result : result.code
}

const referencePluginName =
  'tanstack-router:code-splitter:compile-reference-file'
const virtualPluginName = 'tanstack-router:code-splitter:compile-virtual-file'
const sharedPluginName = 'tanstack-router:code-splitter:compile-shared-file'

/**
 * Drives the three code-splitter transforms the way a bundler does, for the
 * given route files (absolute path to route id). `configPlugins` are the
 * plugins of the resolved Vite config; by default the code splitter itself,
 * so its plugin-order check runs.
 */
export async function createCodeSplitterTransforms(
  options: Partial<Config>,
  routes: Record<string, string>,
  configPlugins: Array<{ name: string }> = [{ name: referencePluginName }],
) {
  const context = createRouterPluginContext()
  for (const [file, routeId] of Object.entries(routes)) {
    context.routesByFile.set(file, { routeId })
  }
  const plugins = createRouterCodeSplitterPlugin(
    { target: 'react', autoCodeSplitting: true, ...options },
    context,
  )
  const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
  const byName = (name: string) => {
    const plugin = pluginArray.find((candidate) => candidate.name === name)
    if (!plugin) {
      throw new Error(`Code-splitter plugin "${name}" not found`)
    }
    return plugin
  }
  const hook = byName(referencePluginName).vite?.configResolved
  const config = {
    root: process.cwd(),
    command: 'build',
    plugins: configPlugins,
  } as never
  if (typeof hook === 'function') {
    await hook.call({} as never, config)
  } else if (hook) {
    await hook.handler.call({} as never, config)
  }
  return {
    reference: (code: string, id: string) =>
      runTransform(byName(referencePluginName), code, id),
    virtual: (code: string, id: string) =>
      runTransform(byName(virtualPluginName), code, id),
    shared: (code: string, id: string) =>
      runTransform(byName(sharedPluginName), code, id),
  }
}

/**
 * The route id the router plugin registers a route file under: runs the
 * plugin's route generator, as the Vite plugin does when the dev server
 * starts, on a temporary routes directory holding `files` (route files by
 * path relative to it; an empty root route unless given), and returns the
 * route id it registered `file` (relative to the routes directory) under.
 */
export async function generatedRouteId(
  file: string,
  files: Record<string, string> = {},
) {
  const root = await mkdtemp(path.join(harnessDir, '.generated-route-id-'))
  try {
    const routes = {
      '__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
      ...files,
    }
    for (const [name, code] of Object.entries(routes)) {
      const target = path.join(root, 'routes', name)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, code)
    }
    const context = createRouterPluginContext()
    const plugin = createRouterGeneratorPlugin(
      {
        target: 'react',
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
        disableLogging: true,
      },
      context,
    ) as UnpluginOptions
    await hookHandler(plugin.vite!.configResolved)!.call(
      {} as never,
      { root } as never,
    )
    const routeId = context.routesByFile.get(
      normalizePath(path.join(root, 'routes', file)),
    )?.routeId
    if (routeId === undefined) {
      throw new Error(`the route generator registered no route for ${file}`)
    }
    return routeId
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * Runs the route HMR plugin (used when automatic code splitting is off) on
 * the route file `file`, registered under `routeId`.
 */
export function transformWithRouteHmrPlugin(
  code: string,
  options: Partial<Config> = { target: 'react' },
  route: { file: string; routeId: string } = {
    file: routeFile('index'),
    routeId: '/',
  },
  compiler?: WebpackCompilerStub,
) {
  const output = createRouteHmrTransform(
    options,
    {
      [route.file]: route.routeId,
    },
    compiler,
  )(code, route.file)
  if (output === null) {
    throw new Error('expected the route HMR plugin to transform the route')
  }
  return output
}

/**
 * The transform of one route HMR plugin instance (used when automatic code
 * splitting is off) for the given route files (absolute path to route id).
 * Returns `null` for a module it leaves as is. With `compiler`, the plugin is
 * configured for webpack with it first.
 */
export function createRouteHmrTransform(
  options: Partial<Config>,
  routes: Record<string, string>,
  compiler?: WebpackCompilerStub,
) {
  const context = createRouterPluginContext()
  for (const [file, routeId] of Object.entries(routes)) {
    context.routesByFile.set(file, { routeId })
  }
  const plugins = createRouterHmrPlugin(options, context)
  const plugin = Array.isArray(plugins) ? plugins[0]! : plugins
  if (compiler) {
    configurePlugins([plugin], { webpack: compiler })
  }
  return (code: string, id: string) => runTransform(plugin, code, id)
}
