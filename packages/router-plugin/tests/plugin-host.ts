/**
 * Hosts the router plugin in a real bundler plugin host: its public Vite
 * adapters (`tanStackRouterCodeSplitter` with a router plugin context from
 * `@tanstack/router-plugin/context`, or the composed `tanstackRouter`) run
 * in a real Vite dev server (middleware mode, no HTTP server, no watcher),
 * which resolves its config, orders the plugins, applies their hook filters
 * and awaits their hooks. A route file is written to a temporary project;
 * the host loads it, its emitted modules (`?tsr-split=…`, `?tsr-shared=…`)
 * resolve through Vite's resolver and load the way Vite loads them. A
 * production compile (`command: 'build'`) is a real Vite production build
 * of the route file instead. Re-exported by `regression-helpers.ts`.
 *
 * What the tests observe is each module as it leaves the router plugin: a
 * plugin right after the router plugin records it (the router transform
 * boundary). The rest of the host's pipeline (Vite's TypeScript/JSX
 * transform, import analysis) is the bundler's business; `loadRoute`
 * evaluates the recorded modules with the real framework's transform.
 *
 * A module id the host cannot produce on this machine (another project
 * root, a Windows path; `moduleId`) is transformed under that id by the
 * same host, and the modules it emits are read from the route file.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { moduleLang } from '@tanstack/compiler-test-utils/module-linker'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { build, createServer, parseSync } from 'vite'
import { afterAll, expect, onTestFinished } from 'vitest'
import { createRouterPluginContext } from '../src/context'
import { tanStackRouterCodeSplitter, tanstackRouter } from '../src/vite'
import type { Plugin, PluginOption, ViteDevServer } from 'vite'
import type { Config, DeletableNodes } from '../src/core/config'

/** A framework the router plugin targets. */
export type TargetFramework = 'react' | 'solid' | 'vue'

export type CompileOptions = {
  /**
   * Path of the route file in the temporary project (default `route.tsx`);
   * its extension gives its language.
   */
  filename?: string
  /**
   * Module id of the route file as a bundler on another machine passes it,
   * instead of a file of the temporary project: e.g. under another project
   * root, or a Windows path (`C:/app/…` from Vite, `C:\\app\\…` from webpack
   * and Rspack). The route is registered under its forward-slash form.
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
   * The Vite command: `serve` (default) compiles in a dev server, `build`
   * in a real production build (where the plugin's own defaults, e.g. no
   * HMR, apply).
   */
  command?: 'serve' | 'build'
  /** Other Vite plugins, before and after the router plugin. */
  plugins?: { before?: Array<PluginOption>; after?: Array<PluginOption> }
}

/** Removes a query from a module id or specifier. */
function withoutQuery(id: string) {
  const index = id.indexOf('?')
  return index === -1 ? id : id.slice(0, index)
}

/** Forward-slash form of a path (webpack and Rspack ids on Windows). */
function normalizePath(file: string) {
  return file.replaceAll('\\', '/')
}

/** Directory of the temporary projects of this test process. */
let projectsDir: string | undefined
function projectRoot() {
  if (!projectsDir) {
    const dir = mkdtempSync(path.join(tmpdir(), 'tsr-plugin-host-'))
    projectsDir = dir
    process.once('exit', () => rmSync(dir, { recursive: true, force: true }))
  }
  return projectsDir
}

/**
 * Runs `close` when the current test ends, or (outside a test) after the
 * current suite; anything left closes with the test process.
 */
function registerCleanup(close: () => Promise<void>) {
  try {
    onTestFinished(close)
  } catch {
    try {
      afterAll(close)
    } catch {
      // Neither in a test nor collecting a suite.
    }
  }
}

/** Thrown by the boundary recorder to end the host's pipeline there. */
class BoundaryReached extends Error {}

/**
 * Records the code of each module as it leaves the plugins before it (the
 * router transform boundary). With `stop`, the host's pipeline ends there:
 * what Vite does with the router plugin's output afterwards is not under
 * test.
 */
export function boundaryRecorder(
  recorded: Map<string, string>,
  stop = false,
) {
  return {
    name: 'test:router-transform-boundary',
    enforce: 'pre',
    transform(code, id) {
      recorded.set(id, code)
      if (stop) {
        throw new BoundaryReached(id)
      }
      return null
    },
  } satisfies Plugin
}

/**
 * Runs a module through the host's transform pipeline up to the router
 * transform boundary; errors before it (the router plugin's) propagate.
 */
async function transformToBoundary(
  server: ViteDevServer,
  recorded: Map<string, string>,
  code: string,
  id: string,
) {
  recorded.delete(id)
  try {
    await server.environments.client.pluginContainer.transform(code, id)
  } catch (error) {
    if (!(error instanceof BoundaryReached)) {
      throw error
    }
  }
  const output = recorded.get(id)
  if (output === undefined) {
    throw new Error(`the host did not transform ${id}`)
  }
  return output
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

/** A specifier the host's resolver may resolve to a module of the route. */
const isPathSpecifier = (specifier: string) =>
  /^(?:\.{1,2}\/|\/|[A-Za-z]:[\\/])/.test(specifier)

/**
 * What the host emits for a route file: the route module and every module
 * its output imports, statically or dynamically, that resolves to the route
 * file (with a query).
 */
export type RouteGraph = {
  /** Id of the route module. */
  id: string
  /** Code of each module as the router plugin emits it, by id, in the order the imports reach them. */
  modules: Map<string, string>
  /** Whether a module is imported statically by some module, or only lazily. */
  importKinds: Map<string, 'static' | 'dynamic'>
  /** What an import of an emitted module resolves to, if a module of the route. */
  resolve: (specifier: string, importer: string) => string | undefined
}

/** Follows the imports of `entry` to every module of the route. */
async function collectGraph(
  id: string,
  emitted: (moduleId: string) => Promise<string>,
  resolveImport: (
    specifier: string,
    importer: string,
  ) => Promise<string | undefined>,
): Promise<RouteGraph> {
  const modules = new Map<string, string>()
  const importKinds = new Map<string, 'static' | 'dynamic'>()
  const resolutions = new Map<string, string>()
  const queue = [id]
  while (queue.length > 0) {
    const moduleId = queue.shift()!
    if (modules.has(moduleId)) {
      continue
    }
    const output = await emitted(moduleId)
    modules.set(moduleId, output)
    for (const { specifier, dynamic } of importRequests(output, moduleId)) {
      const target = await resolveImport(specifier, moduleId)
      if (target === undefined) {
        continue
      }
      resolutions.set(`${moduleId}\0${specifier}`, target)
      if (!dynamic) {
        importKinds.set(target, 'static')
      } else if (!importKinds.has(target)) {
        importKinds.set(target, 'dynamic')
      }
      queue.push(target)
    }
  }
  return {
    id,
    modules,
    importKinds,
    resolve: (specifier, importer) =>
      resolutions.get(`${importer}\0${specifier}`),
  }
}

export function compileRouteGraph(
  code: string,
  options: CompileOptions = {},
): Promise<RouteGraph> {
  return createRouteGraphCompiler(options)(code)
}

/** The code-splitter plugin options of a compile. */
function codeSplitterOptions(options: CompileOptions): Partial<Config> {
  const {
    targetFramework = 'react',
    hmr = false,
    deleteNodes,
    pluginOptions = {},
    command = 'serve',
  } = options
  return {
    target: targetFramework,
    autoCodeSplitting: true,
    ...pluginOptions,
    codeSplittingOptions: {
      // A production build leaves HMR to the plugin's own default.
      ...(command === 'serve' && { addHmr: hmr }),
      deleteNodes,
      ...pluginOptions.codeSplittingOptions,
    },
  }
}

/** A route file a host compiles: where it is and the route id it has. */
export type RouteFileOptions = Pick<
  CompileOptions,
  'filename' | 'moduleId' | 'routeId'
>

/**
 * One code-splitter plugin instance in one host (a dev server), with route
 * files registered as the route generator registers them. The host closes
 * when the test (or, created outside a test, the suite) ends.
 */
export interface RouterHost {
  /**
   * Writes a version of a route file, registers it and compiles it: the
   * route module and every module of the route its output reaches, as the
   * router plugin emits them (as a dev server compiles each edit).
   */
  compile: (code: string, file?: RouteFileOptions) => Promise<RouteGraph>
  /** A module of a compiled route file, by module id, as the router plugin emits it. */
  emit: (moduleId: string) => Promise<string>
}

export function createRouterHost(options: CompileOptions = {}): RouterHost {
  if (options.command === 'build') {
    return {
      compile: (code, file) => buildRouteGraph(code, { ...options, ...file }),
      emit: () => {
        throw new Error('a production build emits its modules once')
      },
    }
  }
  const context = createRouterPluginContext()
  const recorded = new Map<string, string>()
  /** Route files known by their id (not files of the project), by id. */
  const elsewhere = new Map<string, string>()
  let server: Promise<ViteDevServer> | undefined
  const start = async () =>
    createServer({
      configFile: false,
      root: projectRoot(),
      logLevel: 'silent',
      appType: 'custom',
      server: {
        middlewareMode: true,
        ws: false,
        watch: null,
        preTransformRequests: false,
      },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [
        ...(options.plugins?.before ?? []),
        tanStackRouterCodeSplitter(codeSplitterOptions(options), context),
        boundaryRecorder(recorded, true),
        ...(options.plugins?.after ?? []),
      ],
    })
  registerCleanup(async () => {
    // A host whose config the plugins rejected never started.
    await (await server?.catch(() => undefined))?.close()
  })
  const container = async () => {
    server ??= start()
    return (await server).environments.client.pluginContainer
  }

  const emit = async (moduleId: string) => {
    const plugins = await container()
    const other = elsewhere.get(withoutQuery(moduleId))
    const loaded = other === undefined ? await plugins.load(moduleId) : null
    // Vite reads a module no plugin loads from the file its id names.
    const source =
      loaded == null
        ? (other ?? (await readFile(withoutQuery(moduleId), 'utf8')))
        : typeof loaded === 'string'
          ? loaded
          : loaded.code
    return transformToBoundary(await server!, recorded, source, moduleId)
  }

  const resolveImport = (id: string) => async (specifier: string, importer: string) => {
    if (!isPathSpecifier(specifier)) {
      return undefined
    }
    if (elsewhere.has(id)) {
      // A module id from another machine: its modules are named by its id.
      return normalizePath(withoutQuery(specifier)) === normalizePath(id)
        ? `${id}${specifier.slice(withoutQuery(specifier).length)}`
        : undefined
    }
    const resolved = (await (await container()).resolveId(specifier, importer))
      ?.id
    return resolved !== undefined && withoutQuery(resolved) === id
      ? resolved
      : undefined
  }

  return {
    emit,
    compile: async (code, file = {}) => {
      const {
        filename = options.filename ?? 'route.tsx',
        moduleId = options.moduleId,
        routeId = options.routeId ?? '/',
      } = file
      let id: string
      if (moduleId === undefined) {
        const target = path.join(projectRoot(), filename)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, code)
        id = normalizePath(target)
      } else {
        // Transformed under the id as the bundler spells it.
        id = moduleId
        elsewhere.set(id, code)
      }
      context.routesByFile.set(normalizePath(id), { routeId })
      return collectGraph(id, emit, resolveImport(id))
    },
  }
}

/**
 * A function compiling versions of one route file in one host
 * (`createRouterHost`), as a dev server compiles each edit of the file.
 */
export function createRouteGraphCompiler(
  options: CompileOptions = {},
): (code: string) => Promise<RouteGraph> {
  const host = createRouterHost(options)
  return (code) => host.compile(code)
}

/**
 * Compiles the route file in a real Vite production build: Vite's bundler
 * (Rolldown) resolves, loads and follows its emitted modules; other imports
 * stay external.
 */
async function buildRouteGraph(
  code: string,
  options: CompileOptions,
): Promise<RouteGraph> {
  const { filename = 'route.tsx', routeId = '/' } = options
  if (options.moduleId !== undefined) {
    throw new Error('a production compile takes a file of the project')
  }
  const root = projectRoot()
  const file = path.join(root, filename)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, code)
  const id = normalizePath(file)
  const context = createRouterPluginContext()
  context.routesByFile.set(id, { routeId })
  const recorded = new Map<string, string>()
  const resolutions = new Map<string, string | undefined>()
  await build({
    configFile: false,
    root,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      rollupOptions: {
        input: file,
        external: (source, importer) =>
          importer !== undefined && resolutions.get(source) === undefined,
      },
    },
    plugins: [
      ...(options.plugins?.before ?? []),
      tanStackRouterCodeSplitter(codeSplitterOptions(options), context),
      boundaryRecorder(recorded, false),
      {
        // Resolves the imports of the route's modules ahead of the bundler's
        // external check, with the build's own resolver.
        name: 'test:route-module-resolutions',
        enforce: 'pre',
        async transform(output, moduleId) {
          for (const { specifier } of importRequests(output, moduleId)) {
            if (isPathSpecifier(specifier)) {
              const resolved = (await this.resolve(specifier, moduleId))?.id
              resolutions.set(
                specifier,
                resolved !== undefined && withoutQuery(resolved) === id
                  ? resolved
                  : undefined,
              )
            }
          }
          return null
        },
      } satisfies Plugin,
      ...(options.plugins?.after ?? []),
    ],
  })
  return collectGraph(
    id,
    (moduleId) => {
      const output = recorded.get(moduleId)
      return output === undefined
        ? Promise.reject(new Error(`the build did not load ${moduleId}`))
        : Promise.resolve(output)
    },
    (specifier) => Promise.resolve(resolutions.get(specifier)),
  )
}

/** Route file each `compileRouteModules` result was compiled from. */
const routeSources = new WeakMap<object, { code: string; id: string }>()

/**
 * Compiles a route file in the host (default groupings, unless the route
 * sets its own) and returns every module the router plugin emits for it,
 * found by following the imports of the output, without evaluating them.
 *
 * The modules are labelled `reference` (the route module), `shared` for a
 * module another one imports statically, and `lazy <n>` for a module only
 * imported lazily, in discovery order. Which route option loads which lazy
 * module is only known once the route is evaluated: `loadRoute` labels them
 * by option. `ids` gives the module id of each label.
 */
export async function compileRouteModules(
  code: string,
  options: CompileOptions = {},
) {
  return labelRouteModules(code, await compileRouteGraph(code, options))
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
 * must not lose its binding in them (`source` of `getModuleErrors`).
 */
export async function expectValidModules(modules: Record<string, string>) {
  const source = routeSources.get(modules)
  const filename = source ? `module.${moduleLang(source.id)}` : undefined
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await getModuleErrors(code, filename, {
      source: source?.code,
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
 * Sources a module imports that name the compiled route file (`id`, the
 * route module's id), with or without a query: the modules the code
 * splitter emits for it.
 */
export function routeModuleSources(code: string, id: string) {
  return importSources(code).filter((source) => withoutQuery(source) === id)
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

/** Path of a route file in the routes directory of `transformWithRouteHmrPlugin`. */
export function routeFile(name: string) {
  return `${name}.tsx`
}

/** An empty root route of the router package of `target`. */
const rootRoute = (target: Config['target']) =>
  `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute({})
`

/**
 * Runs the route HMR plugin (what the composed `tanstackRouter` plugin uses
 * in dev when automatic code splitting is off) on the route file `file`
 * (relative to the routes directory, `routeFile(name)`), registered by the
 * plugin's route generator.
 */
export async function transformWithRouteHmrPlugin(
  code: string,
  options: Partial<Config> = { target: 'react' },
  file = routeFile('index'),
) {
  const output = await (await createRouteHmrTransform(options, [file]))(
    code,
    file,
  )
  if (output === null) {
    throw new Error('expected the route HMR plugin to transform the route')
  }
  return output
}

/**
 * The transform of the composed `tanstackRouter` plugin with automatic code
 * splitting off (its route HMR plugin), in a real Vite dev server on a
 * project whose routes directory holds `files` (paths relative to it; the
 * generator registers them as routes). Returns, for a version of one of
 * them, the module as the router plugin emits it, or `null` when the plugin
 * leaves it as is.
 */
export async function createRouteHmrTransform(
  options: Partial<Config>,
  files: Array<string>,
) {
  const target = options.target ?? 'react'
  const root = mkdtempSync(path.join(projectRoot(), 'hmr-'))
  const routes = path.join(root, 'routes')
  await mkdir(routes, { recursive: true })
  await writeFile(path.join(routes, '__root.tsx'), rootRoute(target))
  for (const file of files) {
    await mkdir(path.dirname(path.join(routes, file)), { recursive: true })
    await writeFile(
      path.join(routes, file),
      `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({})
`,
    )
  }
  const recorded = new Map<string, string>()
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    appType: 'custom',
    server: {
      middlewareMode: true,
      ws: false,
      watch: null,
      preTransformRequests: false,
    },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      tanstackRouter({
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
        // On the project's device: the generator renames its temporary
        // files into place.
        tmpDir: path.join(root, '.tanstack/tmp'),
        disableLogging: true,
        ...options,
        target,
        autoCodeSplitting: false,
      }),
      boundaryRecorder(recorded, true),
    ],
  })
  registerCleanup(() => server.close())
  return async (code: string, file: string) => {
    const id = normalizePath(path.join(routes, file))
    await writeFile(id, code)
    const output = await transformToBoundary(server, recorded, code, id)
    return output === code ? null : output
  }
}
