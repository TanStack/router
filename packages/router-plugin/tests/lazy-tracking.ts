/**
 * Loads a compiled route with stubs of the router package that track which
 * options load lazily (`loadRoute`), and the stubs it links the route
 * modules with. Re-exported by `regression-helpers.ts`.
 */
import {
  createModuleGraph,
  jsxPragma,
  moduleLang,
} from '@tanstack/compiler-test-utils/module-linker'
import * as React from 'react'
import { transformWithOxc } from 'vite'
import type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'
import { createRouteGraphCompiler, labelRouteModules } from './plugin-host'
import type { CompileOptions, RouteGraph } from './plugin-host'

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
 * Exports of a router package, as much of them as route modules use: routes
 * keep their options, and lazy route options (`lazyRouteComponent`,
 * `lazyFn`) load their module when called or preloaded, like the real ones.
 * `lazy` collects the loader of every lazy value created.
 */
export function createRouterStub(lazy: Map<unknown, () => Promise<unknown>>) {
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
export function withRouterStubs(
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
export async function transformWithReactRefresh(
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
export function refreshScope(registered: Map<unknown, string>) {
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
