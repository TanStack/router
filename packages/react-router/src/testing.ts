import { createMemoryHistory } from '@tanstack/history'
import {
  assertIsolatedRouteLoaded,
  assertRouteTestParams,
  createIsolatedRouteTree,
  createTestRouteTree,
  setTestRouterLocation,
} from '@tanstack/router-core/testing'
import { createRouter } from './router'
import type * as React from 'react'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  RouterConstructorOptions,
  RouterOptions,
  TrailingSlashOption,
  ValidateNavigateOptions,
} from '@tanstack/router-core'
import type {
  AnyRouteTestOverrides,
  RouteTestOverrides as CoreRouteTestOverrides,
  IsolatedRouteState,
} from '@tanstack/router-core/testing'
import type {
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RouteComponent,
} from './route'
import type { Router } from './router'

export type {
  IsolatedRouteState,
  RouteTestBeforeLoadFn,
  RouteTestContextFn,
  RouteTestLoaderFn,
} from '@tanstack/router-core/testing'

/** The component options a test can replace on a route. */
export interface RouteTestComponents {
  component?: RouteComponent
  pendingComponent?: RouteComponent
  errorComponent?: false | null | undefined | ErrorRouteComponent
  notFoundComponent?: NotFoundRouteComponent
}

/**
 * Overrides by route id, typed from the route tree. The root route's id is
 * `rootRouteId`, used as a computed key: `{ [rootRouteId]: { ... } }`.
 */
export type RouteTestOverrides<TRouteTree extends AnyRoute> =
  CoreRouteTestOverrides<TRouteTree, RouteTestComponents>

/** The options of `createTestRouter`: those of `createRouter`, plus two. */
export type CreateTestRouterOptions<
  TRouteTree extends AnyRoute,
  TLocation = unknown,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = RouterConstructorOptions<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
> & {
  routeTree: TRouteTree
  /**
   * Where the router starts, typed like the options of `navigate`. It
   * replaces the current entry of `history`. Defaults to `/`.
   */
  location?: ValidateNavigateOptions<
    Router<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
    TLocation
  >
  /**
   * Per-route overrides. A route that is not listed keeps the application's
   * options.
   */
  overrides?: RouteTestOverrides<TRouteTree>
}

/** The options of `createIsolatedTestRouter`. */
export type CreateIsolatedTestRouterOptions<
  TRouteTree extends AnyRoute,
  TId,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
> = Omit<
  RouterOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    RouterHistory,
    Record<string, any>
  >,
  // `search` is the route's search params here, not the router option.
  'routeTree' | 'history' | 'context' | 'search'
> & {
  routeTree: TRouteTree
  /** The element under test. It renders in place of the route's component. */
  element: React.ReactElement
} & IsolatedRouteState<TRouteTree, TId>

interface AnyCreateTestRouterOptions {
  routeTree: AnyRoute
  location?: object
  overrides?: AnyRouteTestOverrides
  history?: RouterHistory
}

interface AnyCreateIsolatedTestRouterOptions {
  routeTree: AnyRoute
  element: React.ReactElement
  route: string
  params?: Record<string, unknown>
  search?: Record<string, unknown>
  context?: Record<string, unknown>
  loaderData?: Record<string, unknown>
}

/**
 * Creates a router for a test, over a copy of the route tree. It takes the
 * options of `createRouter`, plus `location` and `overrides`. Every route runs
 * the application's own options unless `overrides` replaces them. Without a
 * `history`, the router uses a memory history.
 *
 * The router has not loaded yet. Render it with `RouterProvider`, or call
 * `router.load()` first.
 *
 * ```tsx
 * const router = createTestRouter({
 *   routeTree,
 *   context: { queryClient },
 *   location: { to: '/posts/$postId', params: { postId: '1' } },
 *   overrides: { '/posts/$postId': { loaderData: { post } } },
 * })
 * render(<RouterProvider router={router} />)
 * ```
 */
export function createTestRouter<
  TRouteTree extends AnyRoute,
  const TLocation = unknown,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: CreateTestRouterOptions<
    TRouteTree,
    TLocation,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
): Router<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
> {
  const { routeTree, location, overrides, history, ...routerOptions } =
    options as AnyCreateTestRouterOptions
  const router = createRouter({
    ...routerOptions,
    routeTree: createTestRouteTree(routeTree, overrides),
    history: history ?? createMemoryHistory(),
  } as any)

  if (location) {
    setTestRouterLocation(router, location)
  }

  return router as any
}

/**
 * Creates a router that renders one element inside one route, with the state
 * the test supplies. It resolves once the router has loaded, so the first
 * render of `<RouterProvider router={router} />` is complete.
 *
 * No `context`, `beforeLoad` or `loader` of any route runs, and no route
 * component renders. The options are typed from the route: they ask for the
 * context and the loader data those options would have produced.
 *
 * ```tsx
 * const router = await createIsolatedTestRouter({
 *   routeTree,
 *   route: '/posts/$postId',
 *   element: <PostHeader />,
 *   params: { postId: '1' },
 *   loaderData: { '/posts/$postId': { post } },
 * })
 * render(<RouterProvider router={router} />)
 * ```
 */
export async function createIsolatedTestRouter<
  TRouteTree extends AnyRoute,
  // `IsolatedRouteState` checks that `route` is a route id of the tree.
  const TId extends string,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
>(
  options: CreateIsolatedTestRouterOptions<
    TRouteTree,
    TId,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption
  >,
): Promise<
  Router<TRouteTree, TTrailingSlashOption, TDefaultStructuralSharingOption>
> {
  const {
    routeTree,
    element,
    route,
    params,
    search,
    context,
    loaderData,
    ...routerOptions
  } = options as unknown as AnyCreateIsolatedTestRouterOptions

  const router = createRouter({
    ...routerOptions,
    // Nothing of the application renders around the element, and an error
    // it throws reaches the test instead of an error component.
    defaultComponent: undefined,
    defaultErrorComponent: undefined,
    defaultPendingComponent: undefined,
    disableGlobalCatchBoundary: true,
    routeTree: createIsolatedRouteTree(routeTree, {
      routeId: route,
      component: () => element,
      loaderData: new Map(Object.entries(loaderData ?? {})),
    }),
    history: createMemoryHistory(),
    context,
  } as any)

  assertRouteTestParams(router, route, params)
  setTestRouterLocation(router, {
    to: router.routesById[route]!.fullPath,
    params,
    search,
  })
  await router.load()
  assertIsolatedRouteLoaded(router, route)

  return router as any
}
