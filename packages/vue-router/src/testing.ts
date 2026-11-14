import {
  createIsolatedTestRouterWith,
  createTestRouterWith,
} from '@tanstack/router-core/testing'
import { createRouter } from './router'
import type { VNode } from 'vue'
import type { RouterHistory } from '@tanstack/history'
import type { AnyRoute, TrailingSlashOption } from '@tanstack/router-core'
import type {
  RouteTestOverrides as CoreRouteTestOverrides,
  IsolatedTestRouterOptions,
  TestRouterOptions,
} from '@tanstack/router-core/testing'
import type {
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RouteComponent,
  VueSFC,
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
  component?: RouteComponent | VueSFC
  pendingComponent?: RouteComponent | VueSFC
  errorComponent?: false | null | undefined | ErrorRouteComponent | VueSFC
  notFoundComponent?: NotFoundRouteComponent | VueSFC
}

/**
 * Overrides by route id, typed from the route tree. The root route's id is
 * `rootRouteId`, used as a computed key: `{ [rootRouteId]: { ... } }`.
 */
export type RouteTestOverrides<TRouteTree extends AnyRoute> =
  CoreRouteTestOverrides<TRouteTree, RouteTestComponents>

/** The options of `createTestRouter`: those of `createRouter`, plus `location` and `overrides`. */
export type CreateTestRouterOptions<
  TRouteTree extends AnyRoute,
  TLocation = unknown,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = TestRouterOptions<
  TRouteTree,
  TLocation,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated,
  RouteTestComponents
>

/**
 * The options of `createIsolatedTestRouter`. The element under test is a
 * vnode, for example `<PostHeader />` with Vue JSX or `h(PostHeader)`.
 */
export type CreateIsolatedTestRouterOptions<
  TRouteTree extends AnyRoute,
  TId,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
> = IsolatedTestRouterOptions<
  TRouteTree,
  TId,
  VNode,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption
>

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
  return createTestRouterWith(createRouter, options as any) as any
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
export function createIsolatedTestRouter<
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
  const { element, ...state } = options as any
  // A functional component that renders the vnode under test.
  return createIsolatedTestRouterWith(createRouter, {
    ...state,
    component: () => element,
  }) as any
}
