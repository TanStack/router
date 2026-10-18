/**
 * `hotUpdate`: runs the route HMR code of a compiled route file against a
 * hot API and a live router, in process. Re-exported by
 * `regression-helpers.ts`.
 */
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { vi } from 'vitest'
import { createMemoryHistory } from '../../history/src'
import type { Config } from '../src/core/config'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'
import {
  compileRouteGraph,
  routeFile,
  transformWithRouteHmrPlugin,
  webpackCompiler,
} from './plugin-host'
import type { RouteGraph, TargetFramework } from './plugin-host'
import { stubExports } from './lazy-tracking'
import type { Stubs } from './lazy-tracking'

// Stand-ins of this in-process HMR model only (W2-b moved them here from
// `lazy-tracking.ts`, which now loads routes with the real router and
// React). FIX-PLAN A1 deletes this file with them.

/**
 * Exports of a router package, as much of them as route modules use: routes
 * keep their options, and lazy route options (`lazyRouteComponent`,
 * `lazyFn`) load their module when called or preloaded. `lazy` collects the
 * loader of every lazy value created.
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
      const fn = async (...args: Array<any>) => (await importer())[key](...args)
      lazy.set(fn, async () => (await importer())[key])
      return fn
    },
  }
}

/**
 * JSX as text (the linker's deprecated `runtime` option): intrinsic elements
 * become tags, components are called. One line, so that line numbers stay
 * those of the module.
 */
const textJsxRuntime = [
  `const __Fragment = Symbol('Fragment');`,
  `const __jsx = (type, props, ...children) => {`,
  `const text = children.flat(Infinity).filter((child) => child != null && child !== false && child !== true).join('');`,
  `if (type === __Fragment) return text;`,
  `if (typeof type === 'function') return type({ ...props, children: text });`,
  `if (typeof type !== 'string') throw new Error('cannot render ' + String(type));`,
  `return '<' + type + '>' + text + '</' + type + '>'; };`,
].join(' ')

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
  /** The route file's other imports, by specifier. */
  stubs?: Stubs
}

/** A version of the route file as the bundler compiled it. */
type CompiledRouteFile = Pick<RouteGraph, 'id' | 'modules' | 'resolve'>

/**
 * Runs the route HMR code the router plugin emits, on its own: compiles a
 * route file for the dev server, loads the route module (one hot context per
 * module, its `data` kept across the update), mounts its `Route` in a route
 * tree as the generated route tree does and creates a router with it
 * (`window.__TSR_ROUTER__`), then loads the modules of the edited file
 * (`updated`) and gives each module that accepted its own updates its new
 * version, per the bundler's hot API (Vite: its accept callbacks receive the
 * new module; webpack: the module runs again with the data its dispose
 * handlers wrote).
 *
 * Which modules a bundler updates, and what the page shows after an update,
 * are not modelled here: tests of those run a real dev server and a real
 * page (`route-hmr-page.ts`).
 *
 * Returns the options of the live route before (`previous`) and after
 * (`live`) the update, a copy of the options each module load created a
 * route with (`created`), whether a module asked the bundler for a full
 * reload (`invalidated`), the `window` the modules ran with, and
 * `load(option)`, which resolves a lazy option of the live route to what its
 * module provides.
 */
export async function hotUpdate(code: string, options: HotUpdateOptions = {}) {
  const {
    style = 'vite',
    codeSplitting = false,
    targetFramework = 'react',
    routeId = '/',
  } = options
  const pluginOptions: Partial<Config> = {
    target: targetFramework,
    plugin: { hmr: { style } },
  }
  const compiler =
    style === 'webpack'
      ? webpackCompiler(targetFramework === 'react')
      : undefined
  const compile = (
    source: string,
    compiledRouteId = routeId,
  ): CompiledRouteFile => {
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
      { file, routeId: compiledRouteId },
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
  let invalidated = false
  type HotState = {
    data: Record<string, unknown>
    accepted: Array<(module: unknown) => void>
    disposers: Array<(data: Record<string, unknown>) => void>
  }
  const hotStates = new Map<string, HotState>()
  const hotState = (id: string) => {
    let state = hotStates.get(id)
    if (!state) {
      state = { data: {}, accepted: [], disposers: [] }
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
  const routerPackage = `@tanstack/${targetFramework}-router`
  // The route classes of the framework packages add hooks to the router-core
  // ones; route HMR only uses what router-core provides.
  const routerStub: Record<string, unknown> = {
    ...createRouterStub(lazy),
    createFileRoute: () => recording(createRoute),
    createLazyFileRoute: () => recording(createRoute),
    createRootRoute: recording(createRootRoute),
    createRootRouteWithContext: () => recording(createRootRoute),
    ...stubExports(options.stubs?.[routerPackage]),
  }
  const load = (compiled: CompiledRouteFile) =>
    createModuleGraph({
      modules: Object.fromEntries(compiled.modules),
      resolve: compiled.resolve,
      stubs: { ...options.stubs, [routerPackage]: routerStub },
      runtime: textJsxRuntime,
      importMeta: (id) => ({
        [style === 'webpack' ? 'webpackHot' : 'hot']: hotContext(id),
      }),
    })

  const window: { __TSR_ROUTER__?: RouterCore<any, any, any, any, any> } = {}
  vi.stubGlobal('window', window)
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
        isServer: false,
        origin: 'http://localhost',
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
