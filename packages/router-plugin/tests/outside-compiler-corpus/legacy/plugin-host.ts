// Legacy Node-evaluation harness (module linker, Node rendering, hand-registered
// routes), kept only for the implementation tests of outside-compiler-corpus/.
// Acceptance tests use ../../route-app.ts (public plugin host, browser page).
/**
 * Hosts the router plugin in a real bundler plugin host: its public Vite
 * adapters (`tanStackRouterCodeSplitter` with a router plugin context from
 * `@tanstack/router-plugin/context`, or the composed `tanstackRouter`) run
 * in a real Vite dev server (middleware mode, no HTTP server, no watcher),
 * which resolves its config, orders the plugins, applies their hook filters
 * and awaits their hooks. A route file is written to a temporary project;
 * the host loads it, and every module its output imports resolves through
 * the host's resolver and loads the way the host loads it, whatever its id
 * (a query on the route file, a virtual id, another module). A production
 * compile (`command: 'build'`) is a real Vite production build of the route
 * file instead. Re-exported by `regression-helpers.ts`.
 *
 * What the tests observe is each module as it leaves the router plugin: a
 * plugin right after the router plugin records it (the router transform
 * boundary). The rest of the host's pipeline (Vite's TypeScript/JSX
 * transform, import analysis) is the bundler's business; `loadRoute`
 * evaluates the recorded modules with the real framework's transform.
 *
 * The modules of a route (`RouteGraph`) are the route module and every
 * module its output reaches that the plugins emit, told by what the host's
 * hooks did, never by the shape of an id (SPEC §5.3): a module a plugin of
 * the host loads (a virtual module), or one the router plugin's transform
 * changes (e.g. the route file under a query). A real file the plugins
 * leave as it is (another module of the app) and a package are the app's,
 * not the route's.
 *
 * A module id the host cannot produce on this machine (another project
 * root, a Windows path; `moduleId`) is transformed under that id by the
 * same host. The host cannot resolve files under it, so an import of that
 * id with a query names a module of the route (the one place the host
 * relies on an id's shape); a virtual module still resolves through the
 * host.
 *
 * Warnings and errors the host logs (a plugin's `this.warn`, Vite's own)
 * reach `console.warn` and `console.error`, where the shared diagnostic
 * capture (`captureConsole`) reads them with what the plugins log
 * themselves; the host's informational output stays quiet.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { moduleLang } from '@tanstack/compiler-test-utils/module-linker'
import { build, createServer, parseSync } from 'vite'
import { afterAll, onTestFinished } from 'vitest'
import { createRouterPluginContext } from '../../../src/context'
import { tanStackRouterCodeSplitter, tanstackRouter } from '../../../src/vite'
import type { Logger, Plugin, PluginOption, ViteDevServer } from 'vite'
import type { Config, DeletableNodes } from '../../../src/core/config'

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

/**
 * Directory of the temporary projects of this test file, removed after the
 * file (the hook registers while the test file imports this module).
 */
let projectsDir: string | undefined
export function projectRoot() {
  projectsDir ??= mkdtempSync(path.join(tmpdir(), 'tsr-plugin-host-'))
  return projectsDir
}
afterAll(() => {
  if (projectsDir) {
    rmSync(projectsDir, { recursive: true, force: true })
    projectsDir = undefined
  }
})

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
export function boundaryRecorder(recorded: Map<string, string>, stop = false) {
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
 * Records the code of each module as it enters the router plugin (placed
 * right before it): with the boundary's record, whether the router plugin's
 * transform changed a module.
 */
function inputRecorder(recorded: Map<string, string>) {
  return {
    name: 'test:router-transform-input',
    enforce: 'pre',
    transform(code, id) {
      recorded.set(id, code)
      return null
    },
  } satisfies Plugin
}

/**
 * What the host's hooks did with each module of a compile, for telling the
 * route's modules from the app's (see the module comment): the code each
 * module entered and left the router plugin with, and the ids a plugin of
 * the host loaded (Vite's own plugins, which serve assets, are not
 * observed).
 */
interface HookEvidence {
  inputs: Map<string, string>
  outputs: Map<string, string>
  loaded: Set<string>
}

function createEvidence(): HookEvidence {
  return { inputs: new Map(), outputs: new Map(), loaded: new Set() }
}

/** Whether the plugins emitted the module `id` (see `HookEvidence`). */
function emittedByPlugins(evidence: HookEvidence, id: string) {
  return (
    evidence.loaded.has(id) ||
    (evidence.outputs.has(id) &&
      evidence.outputs.get(id) !== evidence.inputs.get(id))
  )
}

/**
 * The plugins of `option` (nested arrays and promises resolved, as Vite
 * resolves them), each `load` hook recording the ids it loads in `loaded`.
 */
async function observeLoads(
  option: PluginOption,
  loaded: Set<string>,
): Promise<Array<Plugin>> {
  const resolved = await option
  if (!resolved) {
    return []
  }
  if (Array.isArray(resolved)) {
    const plugins: Array<Plugin> = []
    for (const item of resolved) {
      plugins.push(...(await observeLoads(item, loaded)))
    }
    return plugins
  }
  const plugin = resolved as Plugin
  const hook = plugin.load
  if (!hook) {
    return [plugin]
  }
  const handler = typeof hook === 'function' ? hook : hook.handler
  const observed: typeof handler = async function (this: unknown, id, ...rest) {
    const result = await handler.call(this as never, id, ...rest)
    if (result != null) {
      loaded.add(id)
    }
    return result
  }
  return [
    {
      ...plugin,
      load:
        typeof hook === 'function' ? observed : { ...hook, handler: observed },
    },
  ]
}

/**
 * The host's logger: warnings and errors go to `console.warn` and
 * `console.error` (where `captureConsole` reads them), the rest is quiet.
 */
function hostLogger(): Logger {
  const warned = new Set<string>()
  return {
    hasWarned: false,
    info() {},
    warn(message) {
      this.hasWarned = true
      console.warn(message)
    },
    warnOnce(message) {
      if (!warned.has(message)) {
        warned.add(message)
        this.warn(message)
      }
    },
    error(message) {
      console.error(message)
    },
    clearScreen() {},
    hasErrorLogged: () => false,
  }
}

/** The logging options every host of this module runs with. */
const hostLogging = () =>
  ({ logLevel: 'warn', customLogger: hostLogger() }) as const

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

/**
 * A specifier naming a file by its path (relative, absolute, a Windows
 * path); any other one names a package, or a module a plugin provides.
 */
const isPathSpecifier = (specifier: string) =>
  /^(?:\.{1,2}\/|\/|[A-Za-z]:[\\/])/.test(specifier)

/**
 * What the host emits for a route file: the route module and every module
 * its output imports, statically or dynamically, that the plugins emit (see
 * the module comment), transitively.
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

/** A module the host compiled: its code as it left the router plugin. */
type Compiled = { output: string; emitted: boolean }

/**
 * Follows the imports of the route module `id` to every module of the
 * route: `resolveImport` gives the module an import resolves to in the host
 * (undefined: a package, or nothing), `compiled` its output and whether the
 * plugins emitted it (else it is a module of the app, not followed).
 */
async function collectGraph(
  id: string,
  compiled: (moduleId: string) => Promise<Compiled>,
  resolveImport: (
    specifier: string,
    importer: string,
  ) => Promise<string | undefined>,
): Promise<RouteGraph> {
  const modules = new Map<string, string>()
  const importKinds = new Map<string, 'static' | 'dynamic'>()
  const resolutions = new Map<string, string>()
  modules.set(id, (await compiled(id)).output)
  const queue = [id]
  while (queue.length > 0) {
    const moduleId = queue.shift()!
    const output = modules.get(moduleId)!
    for (const { specifier, dynamic } of importRequests(output, moduleId)) {
      const target = await resolveImport(specifier, moduleId)
      if (target === undefined) {
        continue
      }
      if (!modules.has(target)) {
        const module = await compiled(target)
        if (!module.emitted) {
          continue
        }
        modules.set(target, module.output)
        queue.push(target)
      }
      resolutions.set(`${moduleId}\0${specifier}`, target)
      if (!dynamic) {
        importKinds.set(target, 'static')
      } else if (!importKinds.has(target)) {
        importKinds.set(target, 'dynamic')
      }
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

/**
 * The plugins of a host: the test's, and the router plugin between the
 * recorders of what enters and leaves it; every `load` hook is observed.
 */
async function hostPlugins(
  options: CompileOptions,
  context: ReturnType<typeof createRouterPluginContext>,
  evidence: HookEvidence,
  stop: boolean,
): Promise<Array<Plugin>> {
  return observeLoads(
    [
      ...(options.plugins?.before ?? []),
      inputRecorder(evidence.inputs),
      tanStackRouterCodeSplitter(codeSplitterOptions(options), context),
      boundaryRecorder(evidence.outputs, stop),
      ...(options.plugins?.after ?? []),
    ],
    evidence.loaded,
  )
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
  const evidence = createEvidence()
  /** Route files known by their id (not files of the project), by id. */
  const elsewhere = new Map<string, string>()
  let server: Promise<ViteDevServer> | undefined
  const start = async () =>
    createServer({
      configFile: false,
      root: projectRoot(),
      ...hostLogging(),
      appType: 'custom',
      server: {
        middlewareMode: true,
        ws: false,
        watch: null,
        preTransformRequests: false,
      },
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: await hostPlugins(options, context, evidence, true),
    })
  registerCleanup(async () => {
    // A host whose config the plugins rejected never started.
    await (await server?.catch(() => undefined))?.close()
  })
  const container = async () => {
    server ??= start()
    return (await server).environments.client.pluginContainer
  }

  /** Compiles a module up to the router transform boundary. */
  const compileModule = async (moduleId: string): Promise<Compiled> => {
    const plugins = await container()
    const other = elsewhere.get(withoutQuery(moduleId))
    evidence.loaded.delete(moduleId)
    evidence.inputs.delete(moduleId)
    const loaded = other === undefined ? await plugins.load(moduleId) : null
    // Vite reads a module no plugin loads from the file its id names.
    const source =
      loaded == null
        ? (other ?? (await readFile(withoutQuery(moduleId), 'utf8')))
        : typeof loaded === 'string'
          ? loaded
          : loaded.code
    const output = await transformToBoundary(
      await server!,
      evidence.outputs,
      source,
      moduleId,
    )
    return { output, emitted: emittedByPlugins(evidence, moduleId) }
  }

  const resolveImport =
    (id: string) => async (specifier: string, importer: string) => {
      if (elsewhere.has(id) && isPathSpecifier(specifier)) {
        // A module id from another machine: no file resolves under it, its
        // modules are named by its id (see the module comment).
        return normalizePath(withoutQuery(specifier)) === normalizePath(id)
          ? `${id}${specifier.slice(withoutQuery(specifier).length)}`
          : undefined
      }
      const plugins = await container()
      const resolved = await plugins.resolveId(specifier, importer)
      if (!resolved || resolved.external) {
        return undefined
      }
      // A package's file is the app's; a module a plugin serves is followed
      // whatever its specifier.
      if (
        !isPathSpecifier(specifier) &&
        (await plugins.load(resolved.id)) == null
      ) {
        return undefined
      }
      return resolved.id
    }

  return {
    emit: async (moduleId) => (await compileModule(moduleId)).output,
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
      // Each module once per compile: what this version of the file emits.
      const compiled = new Map<string, Promise<Compiled>>()
      return collectGraph(
        id,
        (moduleId) => {
          let module = compiled.get(moduleId)
          if (!module) {
            module = compileModule(moduleId)
            compiled.set(moduleId, module)
          }
          return module
        },
        resolveImport(id),
      )
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
 * (Rolldown) resolves, loads and follows the modules of the app the route
 * file reaches (a module a plugin serves, a file of the project); packages
 * and imports nothing resolves stay external. The route's modules are then
 * told from the app's by what the hooks did (see the module comment).
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
  const evidence = createEvidence()
  /** What each import of a module (`importer\0specifier`) resolved to. */
  const resolutions = new Map<string, string>()
  await build({
    configFile: false,
    root,
    ...hostLogging(),
    build: { write: false, minify: false, rollupOptions: { input: file } },
    plugins: [
      {
        // Resolves each import with the build's own resolver, records it,
        // and leaves packages and what nothing resolves external.
        name: 'test:route-module-resolutions',
        enforce: 'pre',
        async resolveId(specifier, importer) {
          if (importer === undefined) {
            return null
          }
          const resolved = await this.resolve(specifier, importer, {
            skipSelf: true,
          })
          if (
            !resolved ||
            resolved.external ||
            // A package's file (a module a plugin serves names no file)
            (!isPathSpecifier(specifier) &&
              existsSync(withoutQuery(resolved.id)))
          ) {
            return { id: specifier, external: true }
          }
          resolutions.set(`${importer}\0${specifier}`, resolved.id)
          return resolved
        },
      } satisfies Plugin,
      ...(await hostPlugins(options, context, evidence, false)),
    ],
  })
  return collectGraph(
    id,
    (moduleId) => {
      const output = evidence.outputs.get(moduleId)
      return output === undefined
        ? Promise.reject(new Error(`the build did not load ${moduleId}`))
        : Promise.resolve({
            output,
            emitted: emittedByPlugins(evidence, moduleId),
          })
    },
    (specifier, importer) =>
      Promise.resolve(resolutions.get(`${importer}\0${specifier}`)),
  )
}

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
  return { modules, ids, graph }
}

function moduleRecord(code: string) {
  return parseSync('module.tsx', code, { sourceType: 'module' }).module
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
  const output = await (
    await createRouteHmrTransform(options, [file])
  )(code, file)
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
    ...hostLogging(),
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
