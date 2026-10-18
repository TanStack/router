/**
 * Helpers shared by the code-splitter and route HMR regression suites: compile
 * a route file through the code-splitter plugin the way a bundler does,
 * follow the imports of its output to every module it emits, evaluate those
 * modules like a runtime, and inspect an emitted module.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createModuleGraph,
  jsxPragma,
  moduleLang,
} from '@tanstack/compiler-test-utils/module-linker'
import {
  freeIdentifiers,
  getModuleErrors,
} from '@tanstack/compiler-test-utils/validate-module'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import * as React from 'react'
import { parseSync, transformWithOxc } from 'vite'
import { expect, vi } from 'vitest'
import { createMemoryHistory } from '../../history/src'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterGeneratorPlugin } from '../src/core/router-generator-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import { build, routeApp } from './build-harness'
import type { Config, DeletableNodes } from '../src/core/config'
import type { CodeSplitGroupings } from '../src/core/constants'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'
import type { TransformResult, UnpluginOptions } from 'unplugin'
import type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'
import type { ESTree } from 'vite'

export { declaredNames } from '@tanstack/compiler-test-utils/validate-module'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

export const head = `import { createFileRoute } from '@tanstack/react-router'\n`

/**
 * Modules provided by the test, by import specifier: their exports, or the
 * source of a JSON module (`.json` specifiers).
 */
type Stubs = Record<string, ModuleStub>

/** The exports of an object stub; a source stub has none to merge. */
function stubExports(stub: ModuleStub | undefined) {
  return typeof stub === 'object' ? stub : undefined
}

/** A framework the router plugin targets. */
export type TargetFramework = 'react' | 'solid' | 'vue'

type CompileOptions = {
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
   * Code-splitter plugin instances that transform each module in turn, as
   * when an app registers the plugin twice. Default 1.
   */
  instances?: number
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
type RouteGraph = {
  /** Id of the route module. */
  id: string
  /** Code of each module, by id, in the order the imports reach them. */
  modules: Map<string, string>
  /** Whether a module is imported statically by some module, or only lazily. */
  importKinds: Map<string, 'static' | 'dynamic'>
  /** Resolves an import of an emitted module to an emitted module's id. */
  resolve: (specifier: string, importer: string) => string | undefined
}

function compileRouteGraph(
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
function createRouteGraphCompiler(
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
  const plugins: Array<UnpluginOptions> = []
  for (let instance = 0; instance < (options.instances ?? 1); instance++) {
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
    plugins.push(...(Array.isArray(created) ? created : [created]))
  }
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
function labelRouteModules(
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
 * Compiles a route file, evaluates its route module like `loadRoute` (every
 * import the route file makes is stubbed by identity functions, unless
 * `stubs` gives it) and returns the code of the module its `component`
 * option loads lazily.
 */
export async function componentChunk(
  code: string,
  options: LoadRouteOptions = {},
) {
  const route = await loadRoute(code, { stubUnknownImports: true, ...options })
  return route.chunkOf('component')
}

/**
 * Asserts that every module is valid, reporting the errors by module name.
 * For the modules of `compileRouteModules`, the globals the route file reads
 * itself may be read by its modules too.
 */
export async function expectValidModules(modules: Record<string, string>) {
  const source = routeSources.get(modules)
  const filename = source ? `module.${moduleLang(source.id)}` : undefined
  const globals = source
    ? await freeIdentifiers(source.code, filename)
    : undefined
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code, filename, { globals })
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

/**
 * Exports of a router package, as much of them as route modules use: routes
 * keep their options, and lazy route options (`lazyRouteComponent`,
 * `lazyFn`) load their module when called or preloaded, like the real ones.
 * `lazy` collects the loader of every lazy value created.
 */
function createRouterStub(lazy: Map<unknown, () => Promise<unknown>>) {
  const route = (options: unknown) => ({ options })
  return {
    createFileRoute: () => route,
    createLazyFileRoute: () => route,
    createRootRoute: route,
    createRootRouteWithContext: () => route,
    createRoute: route,
    Outlet: () => null,
    lazyRouteComponent: (
      importer: () => Promise<Record<string, any>>,
      exportName = 'default',
    ) => {
      let component: ((props: unknown) => unknown) | undefined
      const load = async () => {
        component = (await importer())[exportName]
        return component
      }
      const Lazy = Object.assign(
        (props: unknown) => {
          if (!component) {
            throw new Error('a lazy route component rendered before it loaded')
          }
          return component(props)
        },
        { preload: load },
      )
      lazy.set(Lazy, load)
      return Lazy
    },
    lazyFn: (importer: () => Promise<Record<string, any>>, key = 'default') => {
      const fn = async (...args: Array<unknown>) =>
        (await importer())[key](...args)
      lazy.set(fn, async () => (await importer())[key])
      return fn
    },
  }
}

const routerPackages = [
  '@tanstack/react-router',
  '@tanstack/solid-router',
  '@tanstack/vue-router',
]

/** Stubs of the router packages, merged with the test's own stubs. */
function withRouterStubs(
  stubs: Stubs,
  lazy: Map<unknown, () => Promise<unknown>>,
): Stubs {
  const linked: Stubs = { ...stubs }
  for (const name of routerPackages) {
    linked[name] = { ...createRouterStub(lazy), ...stubExports(stubs[name]) }
  }
  return linked
}

/**
 * Compiles a module with the React Refresh transform `@vitejs/plugin-react`
 * uses, erasing TypeScript like the linker's default transform (see
 * `verbatimModuleSyntax` of `createModuleGraph`).
 */
async function transformWithReactRefresh(
  code: string,
  id: string,
  verbatimModuleSyntax = true,
) {
  const result = await transformWithOxc(code, 'module', {
    lang: moduleLang(id),
    jsx: { runtime: 'classic', ...jsxPragma, refresh: {} },
    typescript: { onlyRemoveTypeImports: verbatimModuleSyntax },
  })
  return result.code
}

/**
 * Records React Refresh registrations the way the refresh runtime receives
 * them: `$RefreshReg$(type, name)` for each component the transform
 * registers.
 */
function refreshScope(registered: Map<unknown, string>) {
  return {
    $RefreshReg$: (type: unknown, name: string) => {
      registered.set(type, name)
    },
    $RefreshSig$: () => (type: unknown) => type,
  }
}

type LoadRouteOptions = CompileOptions & {
  /** The route file's other imports, by specifier. */
  stubs?: Stubs
  /**
   * Compile every module with the React Refresh transform and record what it
   * registers in `registered`.
   */
  refresh?: boolean
  /**
   * Link every import that neither `stubs` nor the emitted modules provide
   * to a module whose exports are identity functions, for tests that only
   * inspect the emitted modules.
   */
  stubUnknownImports?: boolean
  /**
   * Erase TypeScript like a project with `verbatimModuleSyntax` (default
   * `true`: unused value imports still load) or without it (see
   * `createModuleGraph`).
   */
  verbatimModuleSyntax?: boolean
}

/** Import specifier of the route file in the modules `importFromRoute` adds. */
export const routeSpecifier = '#route'

/** A module stub whose exports are identity functions. */
const identityStub = (_: string, names: Set<string>) =>
  Object.fromEntries(
    [...names].map((name) => [name, (value: unknown) => value]),
  )

/**
 * Compiles a route file like `compileRouteModules`, then evaluates it the
 * way an app does: the route module (and what it imports statically) first,
 * and each lazy module only when a route option loads it. Imports of the
 * emitted modules link to each other; other imports link to `stubs` (the
 * router package is stubbed). Route options are read from the evaluated
 * `Route`; `load(option)` resolves a lazy option to what its module provides.
 */
export async function loadRoute(code: string, options: LoadRouteOptions = {}) {
  return createRouteLoader(options)(code)
}

/**
 * Returns a function that loads a version of the route file like
 * `loadRoute`, every version compiled by the same code-splitter plugin
 * instance, as a dev server compiles each edit of a route file.
 */
export function createRouteLoader(options: LoadRouteOptions = {}) {
  const compile = createRouteGraphCompiler(options)
  return (code: string) => linkRoute(code, compile(code), options)
}

async function linkRoute(
  code: string,
  graph: RouteGraph,
  options: LoadRouteOptions,
) {
  const lazy = new Map<unknown, () => Promise<unknown>>()
  const registered = new Map<unknown, string>()
  const moduleGraph = createModuleGraph({
    modules: Object.fromEntries(graph.modules),
    stubs: withRouterStubs(
      options.refresh
        ? { react: React, ...options.stubs }
        : (options.stubs ?? {}),
      lazy,
    ),
    resolve: (specifier, importer) =>
      specifier === routeSpecifier
        ? graph.id
        : graph.resolve(specifier, importer),
    ...(options.stubUnknownImports && { fallbackStub: identityStub }),
    verbatimModuleSyntax: options.verbatimModuleSyntax,
    ...(options.refresh && {
      scope: () => refreshScope(registered),
      transform: (code: string, id: string) =>
        transformWithReactRefresh(code, id, options.verbatimModuleSyntax),
    }),
  })
  const exports = await moduleGraph.import(graph.id)
  const Route = exports.Route as { options: Record<string, any> } | undefined
  if (!Route) {
    throw new Error('the route module does not export `Route`')
  }
  // The module each lazy option loads: what its loader imports, found
  // without evaluating it.
  const lazyModules = new Map<string, Array<string>>()
  const lazyOptions = new Map<string, Array<string>>()
  for (const option of Object.keys(Route.options)) {
    const loader = lazy.get(Route.options[option])
    if (!loader) {
      continue
    }
    const ids = moduleGraph
      .probeDynamicImports(loader)
      .filter((id) => graph.modules.has(id))
    lazyModules.set(option, ids)
    for (const id of ids) {
      lazyOptions.set(id, [...(lazyOptions.get(id) ?? []), option])
    }
  }
  const compiled = labelRouteModules(code, graph, lazyOptions)
  let importers = 0
  return {
    ...compiled,
    /** Exports of the route module. */
    exports,
    Route,
    options: Route.options,
    /** Ids of the modules evaluated so far, in evaluation order. */
    evaluated: moduleGraph.evaluated,
    /** Whether a route option loads lazily from another module. */
    isLazy: (option: string) => lazy.has(Route.options[option]),
    /** The value of a route option, once its lazy module (if any) loaded. */
    load: (option: string): Promise<any> => {
      const value = Route.options[option]
      const loader = lazy.get(value)
      return loader ? loader() : Promise.resolve(value)
    },
    /**
     * Code of the module a lazy route option loads (found by what its
     * loader imports); fails for an option that is not lazy.
     */
    chunkOf: (option: string): string => {
      const ids = lazyModules.get(option)
      if (!ids || ids.length !== 1) {
        throw new Error(
          `\`${option}\` does not load one module of the route lazily (it loads ${JSON.stringify(ids ?? [])})`,
        )
      }
      return graph.modules.get(ids[0]!)!
    },
    /**
     * Evaluates `source` as another module of the app, next to the route
     * module, and returns its exports: it imports the route file as
     * `routeSpecifier` (`'#route'`) and gets the instance the route uses.
     */
    importFromRoute: (source: string) => {
      const id = `/importer-${++importers}.tsx`
      moduleGraph.add(id, source)
      return moduleGraph.import(id)
    },
    /** Names React Refresh registered each component under (`refresh`). */
    registered,
  }
}

/**
 * Evaluates an emitted module like a runtime would: JSX becomes plain calls
 * that render to text, and imports of every form (named, default, namespace,
 * side-effect only, re-exports) link to `stubs`, keyed by specifier, as real
 * ES modules. `importMeta` is assigned to `import.meta` before the module
 * runs. Every call evaluates a fresh module instance.
 */
export async function evaluateModule(
  code: string,
  stubs: Stubs = {},
  options: { importMeta?: Record<string, unknown>; filename?: string } = {},
): Promise<Record<string, (...args: Array<any>) => any>> {
  const id = routeModuleId(options.filename ?? 'module.tsx')
  const moduleGraph = createModuleGraph({
    modules: { [id]: code },
    stubs,
    ...(options.importMeta && { importMeta: () => options.importMeta! }),
  })
  return moduleGraph.import(id)
}

/**
 * Evaluates one compiled route module on its own with the React Refresh
 * transform: the router package is stubbed, `react` is React, `stubs`
 * provide other imports and any remaining import is a module whose imports
 * are identity functions (`connect(Page)` returns `Page`). `importMeta` is
 * assigned to `import.meta` before the module runs. Returns its exports, its
 * `Route` and what React Refresh registered.
 */
export async function evaluateRouteModule(
  code: string,
  stubs: Stubs = {},
  options: { importMeta?: Record<string, unknown> } = {},
) {
  const id = routeModuleId()
  const registered = new Map<unknown, string>()
  const moduleGraph = createModuleGraph({
    modules: { [id]: code },
    stubs: withRouterStubs({ react: React, ...stubs }, new Map()),
    fallbackStub: (_, names) =>
      Object.fromEntries(
        [...names].map((name) => [name, (value: unknown) => value]),
      ),
    scope: () => refreshScope(registered),
    transform: transformWithReactRefresh,
    ...(options.importMeta && { importMeta: () => options.importMeta! }),
  })
  const exports = await moduleGraph.import(id)
  const Route = exports.Route as { options: Record<string, any> } | undefined
  if (!Route) {
    throw new Error('the route module does not export `Route`')
  }
  return { exports, Route, registered }
}

/**
 * Applies Vite's Oxc React Refresh transform (the one `@vitejs/plugin-react`
 * uses) and returns the registered component names and the hook signature
 * arguments of each signed binding.
 */
export async function reactRefresh(code: string) {
  const result = await transformWithOxc(code, 'route.tsx', {
    jsx: {
      runtime: 'automatic',
      development: true,
      refresh: { emitFullSignatures: true },
    },
  })
  const registered = [
    ...result.code.matchAll(/\$RefreshReg\$\(\w+, "([^"]+)"\)/g),
  ].map((match) => match[1]!)
  const signatures = new Map(
    [...result.code.matchAll(/\b_s\d*\((\w+), ([\s\S]*?)\);\n/g)].map(
      (match) => [match[1]!, match[2]!] as const,
    ),
  )
  return { registered, signatures }
}

/** Parses a module, asserting that it has no syntax errors. */
export function parseModule(code: string): ESTree.Program {
  const { program, errors } = parseSync('route.tsx', code, {
    sourceType: 'module',
  })
  expect(errors).toEqual([])
  return program
}

/**
 * The value of `option` on the `Route` a compiled route module creates, once
 * evaluated (see `evaluateRouteModule` for how its imports are linked).
 */
export async function getRouteOption(
  code: string,
  option: string,
  stubs: Stubs = {},
) {
  const { Route } = await evaluateRouteModule(code, stubs)
  return Route.options[option] as unknown
}

/**
 * Asserts that the module is valid and that React Refresh registers the
 * value of the `option` of the `Route` it creates, so that edits of that
 * component hot-update. Returns the name it is registered under.
 */
export async function expectRegisteredRouteOption(
  code: string,
  option: string,
) {
  expect(await getModuleErrors(code)).toEqual([])
  const { Route, registered } = await evaluateRouteModule(code)
  const name = registered.get(Route.options[option])
  expect(
    name,
    `\`${option}\` is not a component React Refresh registers (registered: ${[...registered.values()].join(', ')})`,
  ).toBeDefined()
  return name!
}

const memoType = Symbol.for('react.memo')
const forwardRefType = Symbol.for('react.forward_ref')

/**
 * Asserts that React Refresh can hot-update the component of `option`: the
 * option is a component React Refresh registers, or a `memo(...)` /
 * `forwardRef(...)` (nested or not) of one, since React Refresh resolves
 * those wrappers through the function they wrap.
 */
export async function expectRefreshableRouteOption(
  code: string,
  option: string,
) {
  expect(await getModuleErrors(code)).toEqual([])
  const { Route, registered } = await evaluateRouteModule(code)
  expect(
    isRefreshable(Route.options[option], registered),
    `\`${option}\` is neither a component React Refresh registers nor a memo/forwardRef of one (registered: ${[...registered.values()].join(', ')})`,
  ).toBe(true)
}

/**
 * Whether React Refresh can hot-update `component`: it is registered
 * (`registered`, as `loadRoute` and `hotUpdate` record it), or it is a
 * `memo(...)` / `forwardRef(...)` (nested or not) of a registered component.
 */
export function isRefreshable(
  component: unknown,
  registered: Map<unknown, string>,
) {
  let current: any = component
  while (!registered.has(current) && current && typeof current === 'object') {
    if (current.$$typeof === memoType) {
      current = current.type
    } else if (current.$$typeof === forwardRefType) {
      current = current.render
    } else {
      return false
    }
  }
  return registered.has(current)
}

const getStoreConfig: GetStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn) => fn(),
})

export type HotUpdateOptions = {
  /** The bundler HMR API the route is compiled for and run with. Default `vite`. */
  style?: 'vite' | 'webpack'
  /**
   * Compile with automatic code splitting (the code splitter with HMR, its
   * modules linked like `loadRoute`) instead of the route HMR plugin alone.
   */
  codeSplitting?: boolean
  /** Default `react`. */
  targetFramework?: TargetFramework
  /**
   * Route id the route file is registered under. Default `/`. A root route
   * (`createRootRoute`) is the route tree's root; its file is registered
   * under the id the route generator gives it (`generatedRouteId`).
   */
  routeId?: string
  /** The edited route file the update loads. Default: `code` again. */
  updated?: string
  /**
   * Route id the route file was registered under when the first version
   * was compiled, when the route tree registers it under another one since
   * (`routeId`), e.g. after a route configuration change. Default `routeId`.
   */
  previousRouteId?: string
  /**
   * A React Refresh runtime is present: modules are compiled with the React
   * Refresh transform (`registered`) and the bundler's refresh utilities
   * (`__react_refresh_utils__`) record each update they are asked for
   * (`refreshes`). With webpack, the plugins are also configured with a
   * compiler that has the React Refresh plugin, or none
   * (`webpackCompiler(refresh)`), as an app is.
   */
  refresh?: boolean
  /** The route file's other imports, by specifier. */
  stubs?: Stubs
}

/**
 * Compiles a route file for the dev server, then runs a hot update the way
 * the bundler does: loads the route module with the bundler's hot API on
 * `import.meta` (one hot context per module, its `data` kept across the
 * update), mounts its `Route` in a route tree as the generated route tree
 * does and creates a router with it (`window.__TSR_ROUTER__`), then loads
 * the modules again (`updated`) with the same hot data (Vite: each first
 * module's accept callback receives its new module; webpack: the modules
 * re-run with the data their dispose handlers wrote).
 *
 * Returns the options of the live route before (`previous`) and after
 * (`live`) the update, a copy of the options each module load created a
 * route with (`created`), whether a module asked the bundler for a full
 * reload (`invalidated`), the `window` the modules ran with, what React
 * Refresh registered and how many
 * refreshes were enqueued (`refresh`), and `load(option)`, which resolves a
 * lazy option of the live route to what its module provides.
 */
export async function hotUpdate(code: string, options: HotUpdateOptions = {}) {
  const {
    style = 'vite',
    codeSplitting = false,
    targetFramework = 'react',
    routeId = '/',
    refresh = false,
  } = options
  const pluginOptions: Partial<Config> = {
    target: targetFramework,
    plugin: { hmr: { style } },
  }
  const compiler = style === 'webpack' ? webpackCompiler(refresh) : undefined
  const compile = (source: string, compiledRouteId = routeId) => {
    if (codeSplitting) {
      return compileRouteGraph(source, {
        targetFramework,
        hmr: true,
        routeId: compiledRouteId,
        pluginOptions,
        webpackCompiler: compiler,
      })
    }
    const file = routeFile('index')
    const compiled = transformWithRouteHmrPlugin(
      source,
      pluginOptions,
      {
        file,
        routeId: compiledRouteId,
      },
      compiler,
    )
    return {
      id: file,
      modules: new Map([[file, compiled]]),
      resolve: () => undefined,
    }
  }
  const first = compile(code, options.previousRouteId)
  const second =
    options.updated === undefined && options.previousRouteId === undefined
      ? first
      : compile(options.updated ?? code)

  const created: Array<Record<string, unknown>> = []
  const lazy = new Map<unknown, () => Promise<unknown>>()
  const registered = new Map<unknown, string>()
  let invalidated = false
  let refreshes = 0
  type HotState = {
    data: Record<string, unknown>
    accepted: Array<(module: unknown) => void>
    disposers: Array<(data: Record<string, unknown>) => void>
  }
  const hotStates = new Map<string, HotState>()
  const hotState = (id: string) => {
    let state = hotStates.get(id)
    if (!state) {
      state = {
        data: {},
        accepted: [],
        disposers: [],
      }
      hotStates.set(id, state)
    }
    return state
  }
  const hotContext = (id: string) => {
    const state = hotState(id)
    return {
      data: state.data,
      accept: (callback?: (module: unknown) => void) => {
        if (callback) {
          state.accepted.push(callback)
        }
      },
      dispose: (callback: (data: Record<string, unknown>) => void) => {
        state.disposers.push(callback)
      },
      invalidate: () => {
        invalidated = true
      },
    }
  }

  const recording =
    (create: (options: Record<string, unknown>) => unknown) =>
    (routeOptions: Record<string, unknown> = {}) => {
      // A copy: the HMR code writes kept options into the new ones.
      created.push({ ...routeOptions })
      return create(routeOptions)
    }
  const createRoute = (routeOptions: Record<string, unknown>) => {
    const route = new BaseRoute(routeOptions as never) as unknown as {
      isRoot: boolean
    }
    route.isRoot = false
    return route
  }
  // Root routes the modules created: the route tree's root.
  const rootRoutes = new WeakSet<object>()
  const createRootRoute = (routeOptions: Record<string, unknown>) => {
    const route = new BaseRootRoute(routeOptions as never)
    rootRoutes.add(route)
    return route
  }
  const lazyStubs = createRouterStub(lazy)
  const routerPackage = `@tanstack/${targetFramework}-router`
  // The route classes of the framework packages add hooks to the router-core
  // ones; route HMR only uses what router-core provides.
  const routerStub: Record<string, unknown> = {
    ...lazyStubs,
    createFileRoute: () => recording(createRoute),
    createLazyFileRoute: () => recording(createRoute),
    createRootRoute: recording(createRootRoute),
    createRootRouteWithContext: () => recording(createRootRoute),
  }
  const load = (graph: Pick<RouteGraph, 'id' | 'modules' | 'resolve'>) =>
    createModuleGraph({
      modules: Object.fromEntries(graph.modules),
      resolve: graph.resolve,
      stubs: {
        ...(refresh && { react: React }),
        ...options.stubs,
        [routerPackage]: {
          ...routerStub,
          ...stubExports(options.stubs?.[routerPackage]),
        },
      },
      importMeta: (id) => ({
        [style === 'webpack' ? 'webpackHot' : 'hot']: hotContext(id),
      }),
      ...(refresh && {
        scope: () => refreshScope(registered),
        transform: transformWithReactRefresh,
      }),
    })

  const window: { __TSR_ROUTER__?: RouterCore<any, any, any, any, any> } = {}
  vi.stubGlobal('window', window)
  if (refresh) {
    vi.stubGlobal('__react_refresh_utils__', {
      enqueueUpdate: (callback: () => void) => {
        refreshes++
        callback()
      },
    })
  }
  try {
    const firstGraph = load(first)
    const firstModule = await firstGraph.import(first.id)
    const isRoot = rootRoutes.has(firstModule.Route as object)
    let routeTree: AnyRoute
    if (isRoot) {
      routeTree = firstModule.Route as AnyRoute
    } else {
      const rootRoute = new BaseRootRoute({})
      const route = (firstModule.Route as AnyRoute).update({
        id: routeId,
        path: routeId,
        getParentRoute: () => rootRoute,
      } as never)
      routeTree = rootRoute.addChildren([route]) as unknown as AnyRoute
    }
    const router = new RouterCore(
      {
        routeTree,
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: true,
      },
      getStoreConfig,
    )
    window.__TSR_ROUTER__ = router
    // The id the route tree gave the route (`__root__` for the root)
    const liveId = (firstModule.Route as AnyRoute).id
    const liveOptions = () =>
      (
        router.routesById[liveId] as unknown as {
          options: Record<string, unknown>
        }
      ).options
    const previous = { ...liveOptions() }

    if (style === 'webpack') {
      for (const state of hotStates.values()) {
        const next: Record<string, unknown> = {}
        state.disposers.forEach((dispose) => dispose(next))
        state.data = next
        state.disposers = []
      }
    }
    const accepted = new Map(
      [...hotStates].map(([id, state]) => [id, state.accepted]),
    )
    for (const state of hotStates.values()) {
      state.accepted = []
    }
    const secondGraph = load(second)
    await secondGraph.import(second.id)
    // The route module's update first, then the other modules that accept
    // their own updates, each with its new module.
    const updates = [...accepted].sort(
      ([a], [b]) => Number(b === first.id) - Number(a === first.id),
    )
    for (const [id, callbacks] of updates) {
      if (callbacks.length === 0 || !second.modules.has(id)) {
        continue
      }
      const updatedModule = await secondGraph.import(id)
      callbacks.forEach((accept) => accept(updatedModule))
    }

    const live = liveOptions()
    return {
      /** Id of the route file, as the plugin saw it. */
      file: first.id,
      previous,
      live,
      created,
      invalidated,
      /** The `window` the modules ran with (the router is `__TSR_ROUTER__`). */
      window,
      refresh: { registered, refreshes },
      /** Whether an option of the live route loads lazily from another module. */
      isLazy: (option: string) => lazy.has(live[option]),
      /** The value of an option of the live route, once its lazy module loaded. */
      load: (option: string): Promise<any> => {
        const loader = lazy.get(live[option])
        return loader ? loader() : Promise.resolve(live[option])
      },
    }
  } finally {
    vi.unstubAllGlobals()
  }
}

/**
 * Builds a small app with the real Vite plugin (code splitting on, default
 * groupings unless `groupings` is given): `routes/index.tsx` holds `route`,
 * and `entry.ts` re-exports the route module next to `render(component)`,
 * which preloads a component and renders it to a string. `files` adds files
 * or replaces `entry.ts`. The app directory name starts with `prefix`. Then
 * imports the built entry in a separate Node process and returns the JSON
 * value returned by `script`, which has the entry's exports in scope as
 * `entry`.
 *
 * A production Vite SSR build of `build-harness.ts`, without minification.
 * The app's `package.json` declares no side-effect hint unless `sideEffects`
 * gives one, like an app's.
 */
export async function buildAndRun(
  route: string,
  script: string,
  options: {
    files?: Record<string, string>
    groupings?: CodeSplitGroupings
    prefix?: string
    sideEffects?: boolean
  } = {},
) {
  const app = await build({
    bundler: 'vite',
    env: 'ssr',
    minify: false,
    sideEffects: options.sideEffects,
    prefix: options.prefix ?? '.regression-build-',
    files: routeApp(route, { files: options.files }),
    pluginOptions: options.groupings && {
      codeSplittingOptions: { defaultBehavior: options.groupings },
    },
  })
  try {
    return (await app.run(script)).result
  } finally {
    await app.dispose()
  }
}
