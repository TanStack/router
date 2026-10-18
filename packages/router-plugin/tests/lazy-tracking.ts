/**
 * Loads a compiled route file the way an app does, with the real router
 * package and the real framework: the route module (and what it imports
 * statically) evaluates first, each split option's module only when the
 * router loads it. Laziness is observed through the router's public lazy
 * contract (a route component's `preload()`, a loader call) and the modules
 * actually requested, never by recognising the helper that builds a lazy
 * value (SPEC J2.6, §5.8): `lazyRouteComponent`, `lazyFn`, an equivalent
 * wrapper or an intermediate module all pass. Re-exported by
 * `regression-helpers.ts`.
 *
 * API (`loadRoute(code, options)` / `createRouteLoader(options)(code)`):
 * - `modules`, `ids`, `graph`: the compiled modules (`compileRouteModules`).
 * - `exports`, `Route`, `options`: the route module's exports, the real
 *   route it creates, the route's options.
 * - `evaluated`: compiled modules evaluated so far (load observer);
 *   `eager`: the route module and every module its load requested (compiled
 *   modules, stubs, packages); `requested`: everything requested so far.
 * - `isLazy(option)`: loading the option requests a compiled module that has
 *   not loaded with the route module.
 * - `load(option)`: the option as the router uses it, once its module loaded
 *   (components: after `preload()`; a loader loads its module when called).
 * - `render(option, props)`: the option's component rendered by the real
 *   framework's server renderer, after `load`.
 * - `renderRoute({ at })`: the app (a root route rendering this route)
 *   rendered by the real router on the server: `createRouter`, memory
 *   history at `at` (default the route id), `router.load()`, then
 *   `RouterProvider` rendered. Loaders, error and not-found states, and route
 *   hooks such as `Route.useLoaderData()` run as in an app.
 * - `loadedBy(option)`: the code of each compiled module loading the option
 *   evaluates (one or more: facades and support modules are allowed).
 * - `groups()`: which lazy options load together. Activating a lazy option
 *   makes every option of its group available (its loading requests nothing
 *   new); options of another group stay unrequested.
 * - `importFromRoute(source)`: another module of the app importing the route
 *   module (`'#route'`), for identity checks through a real importer.
 * - `registered`: what React Refresh registered (`refresh`).
 *
 * The observers that load something (`isLazy`, `loadedBy`, `groups`) run in
 * forks of the graph (`@tanstack/compiler-test-utils/lazy-probe`: fresh
 * module instances, same stubs), so the route a test inspects loads nothing
 * it did not ask for. The route module's top-level code runs again in each
 * fork with the same stubs: assert what stubs record before using these.
 * `isLazy('loader')` calls the loader once in a fork, without arguments: a
 * loader that is not lazy runs there.

 */
import path from 'node:path'
import { createLazyProbe } from '@tanstack/compiler-test-utils/lazy-probe'
import {
  createModuleGraph,
  moduleLang,
} from '@tanstack/compiler-test-utils/module-linker'
import {
  frameworkTransform,
  renderToHtml,
} from '@tanstack/compiler-test-utils/render'
import { transformWithOxc } from 'vite'
import { createRouteGraphCompiler, labelRouteModules } from './plugin-host'
import type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'
import type { CompileOptions, RouteGraph, TargetFramework } from './plugin-host'

/**
 * Modules provided by the test, by import specifier: their exports, or the
 * source of a JSON module (`.json` specifiers).
 */
export type Stubs = Record<string, ModuleStub>

/** The exports of an object stub; a source stub has none to merge. */
export function stubExports(stub: ModuleStub | undefined) {
  return typeof stub === 'object' ? stub : undefined
}

/**
 * The router plugin's own directory: the real packages compiled modules
 * import (`react`, `react-dom`, the router packages, Solid, Vue) resolve
 * from its dependencies.
 */
export const packagesDirectory = path.join(import.meta.dirname, '..')

/** A graph that only links packages: the instances every route graph gets. */
const packageGraph = createModuleGraph({ packages: packagesDirectory })

/**
 * Server-renders a component of a compiled module with the real `framework`
 * (default React), the instance compiled modules get.
 */
export function renderComponent(
  component: unknown,
  props: Record<string, unknown> = {},
  framework: TargetFramework = 'react',
) {
  return renderToHtml(packageGraph, framework, component, props)
}

/**
 * Compiles a route file, evaluates its route module like `loadRoute` (every
 * import the route file makes that no package provides is stubbed by
 * identity functions, unless `stubs` gives it) and returns the code of each
 * module loading its `component` option evaluates (`loadedBy`).
 */
export async function componentModules(
  code: string,
  options: LoadRouteOptions = {},
) {
  const route = await loadRoute(code, { stubUnknownImports: true, ...options })
  return route.loadedBy('component')
}

/**
 * Compiles a module with the React Refresh transform `@vitejs/plugin-react`
 * uses, erasing TypeScript like the linker's default transform (see
 * `verbatimModuleSyntax` of `createModuleGraph`).
 */
export async function transformWithReactRefresh(
  code: string,
  id: string,
  verbatimModuleSyntax = true,
) {
  const result = await transformWithOxc(code, 'module', {
    lang: moduleLang(id),
    jsx: { runtime: 'automatic', refresh: {} },
    typescript: { onlyRemoveTypeImports: verbatimModuleSyntax },
  })
  return result.code
}

/**
 * Records React Refresh registrations the way the refresh runtime receives
 * them: `$RefreshReg$(type, name)` for each component the transform
 * registers.
 */
export function refreshScope(registered: Map<unknown, string>) {
  return {
    $RefreshReg$: (type: unknown, name: string) => {
      registered.set(type, name)
    },
    $RefreshSig$: () => (type: unknown) => type,
  }
}

export type LoadRouteOptions = CompileOptions & {
  /**
   * The route file's other imports, by specifier. The router package and
   * the framework are the real packages; do not stub them.
   */
  stubs?: Stubs
  /**
   * Compile every module with the React Refresh transform and record what it
   * registers in `registered`.
   */
  refresh?: boolean
  /**
   * Link every import that neither `stubs`, the emitted modules nor an
   * installed package provide to a module whose exports are identity
   * functions, for tests that only inspect the emitted modules.
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

/** Route options the code splitter may split. */
const splittableOptions = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
  'loader',
]

/**
 * Starts loading a route option the way the router does: a component's
 * `preload()` (what intent preloading and `loadRouteChunk` call), a loader's
 * call (function or `{ handler }`), without arguments.
 */
function triggerOption(value: any, option: string) {
  if (option === 'loader') {
    const loader = typeof value === 'function' ? value : value?.handler
    return typeof loader === 'function' ? loader() : undefined
  }
  return value?.preload?.()
}

/**
 * Compiles a route file like `compileRouteModules`, then evaluates it the
 * way an app does: the route module (and what it imports statically) first,
 * and each lazy module only when the router loads a route option. Imports
 * of the emitted modules link to each other; `stubs` provide other imports;
 * everything else is a real installed package (the router package and the
 * framework among them). See the file header for what the result offers.
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
  return async (code: string) => linkRoute(code, await compile(code), options)
}

/**
 * Loads modules given as a compiled route graph, like `loadRoute` loads the
 * code splitter's output: for controls of the harness on fixed graphs, of
 * any shape a correct compiler may emit.
 */
export function loadRouteGraph(
  graph: RouteGraph,
  options: LoadRouteOptions = {},
) {
  return linkRoute(graph.modules.get(graph.id)!, graph, options)
}

async function linkRoute(
  code: string,
  graph: RouteGraph,
  options: LoadRouteOptions,
) {
  const framework = options.targetFramework ?? 'react'
  const routerPackage = `@tanstack/${framework}-router`
  const registered = new Map<unknown, string>()
  const moduleGraph = createModuleGraph({
    modules: Object.fromEntries(graph.modules),
    stubs: options.stubs,
    packages: packagesDirectory,
    resolve: (specifier, importer) =>
      specifier === routeSpecifier
        ? graph.id
        : graph.resolve(specifier, importer),
    ...(options.stubUnknownImports && { fallbackStub: identityStub }),
    verbatimModuleSyntax: options.verbatimModuleSyntax,
    ...(options.refresh
      ? {
          scope: () => refreshScope(registered),
          transform: (code: string, id: string) =>
            transformWithReactRefresh(code, id, options.verbatimModuleSyntax),
        }
      : { transform: frameworkTransform(framework, packagesDirectory) }),
  })
  const exports = await moduleGraph.import(graph.id)
  const Route = exports.Route as
    | { options: Record<string, any>; isRoot?: boolean }
    | undefined
  if (!Route) {
    throw new Error('the route module does not export `Route`')
  }
  const eager = [graph.id, ...moduleGraph.requested]

  // Laziness by the modules starting to load an option requests, in forks
  // of the graph (only compiled modules count, not stubs or packages).
  const probe = createLazyProbe(
    moduleGraph,
    graph.id,
    Object.fromEntries(
      splittableOptions.map((option) => [
        option,
        (forked: Record<string, any>) =>
          triggerOption(forked.Route?.options[option], option),
      ]),
    ),
    { owned: (id) => graph.modules.has(id) },
  )

  const load = async (option: string): Promise<any> => {
    const value = Route.options[option]
    if (option !== 'loader') {
      await value?.preload?.()
    }
    return value
  }

  let routeTree: Promise<unknown> | undefined
  /** The real route tree: a root route rendering this route. */
  const createRouteTree = async () => {
    if (Route.isRoot) {
      return Route
    }
    const router = await moduleGraph.importPackage(routerPackage)
    const routeId = options.routeId ?? '/'
    const root = router.createRootRoute()
    ;(Route as any).update({
      id: routeId,
      path: routeId,
      getParentRoute: () => root,
    })
    return root.addChildren([Route])
  }

  let importers = 0
  return {
    ...labelRouteModules(code, graph),
    /** Exports of the route module. */
    exports,
    Route,
    options: Route.options,
    /** Ids of the compiled modules evaluated so far, in evaluation order. */
    evaluated: moduleGraph.evaluated,
    /** The route module and every module its load requested (see the header). */
    eager,
    /** Every module requested so far (see `ModuleGraph.requested`). */
    requested: moduleGraph.requested,
    isLazy: probe.isLazy,
    load,
    /** Renders the option's component with `props` (see the header). */
    render: async (option: string, props: Record<string, unknown> = {}) =>
      renderToHtml(moduleGraph, framework, await load(option), props),
    /** Renders the app through the real router (see the header). */
    renderRoute: async ({ at }: { at?: string } = {}) => {
      routeTree ??= createRouteTree()
      const { createRouter, createMemoryHistory, RouterProvider } =
        await moduleGraph.importPackage(routerPackage)
      const router = createRouter({
        routeTree: await routeTree,
        history: createMemoryHistory({
          initialEntries: [at ?? options.routeId ?? '/'],
        }),
      })
      await router.load()
      return renderToHtml(moduleGraph, framework, RouterProvider, { router })
    },
    /**
     * Code of each compiled module that loading the option evaluates, in
     * evaluation order; fails for an option that is not lazy.
     */
    loadedBy: async (option: string): Promise<Array<string>> => {
      const loaded = await probe.loadedBy(option)
      if (loaded.length === 0) {
        throw new Error(`\`${option}\` loads no module of the route lazily`)
      }
      return loaded.map((id) => graph.modules.get(id)!)
    },
    /**
     * The lazy options grouped by what loads together, each group sorted,
     * groups sorted (see the header). A group that pulls another group's
     * option without the reverse shows as two overlapping groups.
     */
    groups: () =>
      probe.groups(
        splittableOptions.filter((option) => option in Route.options),
      ),
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
