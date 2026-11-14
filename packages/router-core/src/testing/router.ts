import { createMemoryHistory } from '@tanstack/history'
import {
  assertIsolatedRouteLoaded,
  assertRouteTestParams,
  createIsolatedRouteTree,
  createTestRouteTree,
  setTestRouterLocation,
} from './routeTree'
import type { RouterHistory } from '@tanstack/history'
import type { AnyRoute } from '../route'
import type { AnyRouter } from '../router'
import type { AnyRouteTestOverrides } from './routeTree'

/** A framework's `createRouter`. */
export type TestRouterFactory<TRouter extends AnyRouter = AnyRouter> = (
  options: any,
) => TRouter

/** The untyped options of `createTestRouterWith`. */
export interface AnyTestRouterOptions {
  routeTree: AnyRoute
  location?: object
  overrides?: AnyRouteTestOverrides
  history?: RouterHistory
  [option: string]: unknown
}

/** The untyped options of `createIsolatedTestRouterWith`. */
export interface AnyIsolatedTestRouterOptions {
  routeTree: AnyRoute
  /** The framework component that renders the element under test. */
  component: unknown
  route: string
  params?: Record<string, unknown>
  search?: Record<string, unknown>
  context?: Record<string, unknown>
  loaderData?: Record<string, unknown>
  [option: string]: unknown
}

/**
 * The framework-independent part of `createTestRouter`. Framework packages
 * call it with their own `createRouter` and declare the typed signature.
 *
 * Creates a router over a copy of the route tree with the overrides applied.
 * The router uses a memory history unless `history` is given, and starts at
 * `location`. It has not loaded yet.
 */
export function createTestRouterWith<TRouter extends AnyRouter>(
  createRouter: TestRouterFactory<TRouter>,
  options: AnyTestRouterOptions,
): TRouter {
  const { routeTree, location, overrides, history, ...routerOptions } = options
  const router = createRouter({
    ...routerOptions,
    routeTree: createTestRouteTree(routeTree, overrides),
    history: history ?? createMemoryHistory(),
  })

  if (location) {
    setTestRouterLocation(router, location)
  }

  return router
}

/**
 * The framework-independent part of `createIsolatedTestRouter`. Framework
 * packages call it with their own `createRouter`, turn the element under test
 * into `component`, and declare the typed signature.
 *
 * Creates a router in which no route option that does work or renders
 * remains, renders `component` in the route `route`, and resolves once the
 * router has loaded at that route's location.
 */
export async function createIsolatedTestRouterWith<TRouter extends AnyRouter>(
  createRouter: TestRouterFactory<TRouter>,
  options: AnyIsolatedTestRouterOptions,
): Promise<TRouter> {
  const {
    routeTree,
    component,
    route,
    params,
    search,
    context,
    loaderData,
    ...routerOptions
  } = options

  const router = createRouter({
    ...routerOptions,
    // Nothing of the application renders around the element, and the router
    // does not catch an error that the element throws.
    defaultComponent: undefined,
    defaultErrorComponent: undefined,
    defaultPendingComponent: undefined,
    defaultNotFoundComponent: undefined,
    disableGlobalCatchBoundary: true,
    routeTree: createIsolatedRouteTree(routeTree, {
      routeId: route,
      component,
      loaderData: new Map(Object.entries(loaderData ?? {})),
    }),
    history: createMemoryHistory(),
    context,
  })

  assertRouteTestParams(router, route, params)
  setTestRouterLocation(router, {
    to: (router.routesById as Record<string, AnyRoute>)[route]!.fullPath,
    params,
    search,
  })
  await router.load()
  assertIsolatedRouteLoaded(router, route)

  return router
}
