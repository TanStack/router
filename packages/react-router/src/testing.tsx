import { createMemoryHistory } from '@tanstack/history'
import {
  assertIsolatedRouteLoaded,
  assertRouteTestParams,
  createIsolatedRouteTree,
  createTestRouteTree,
  setTestRouterLocation,
} from '@tanstack/router-core/testing'
import { RouterProvider } from './RouterProvider'
import { createRouter } from './router'
import type * as React from 'react'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  RouteIds,
  RouterOptions,
  TrailingSlashOption,
  ValidateNavigateOptions,
} from '@tanstack/router-core'
import type {
  AnyRouteTestOverrides,
  RouteTestOverrides as CoreRouteTestOverrides,
  RouterTestingDefaults as CoreRouterTestingDefaults,
  RouteTestOptions,
  TestRouterContextOption,
} from '@tanstack/router-core/testing'
import type {
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RouteComponent,
} from './route'
import type { Router } from './router'

export type {
  RouteTestBeforeLoadFn,
  RouteTestContextFn,
  RouteTestLoaderFn,
  RouteTestOptions,
} from '@tanstack/router-core/testing'

/** The component options a test can replace on a route. */
export interface RouteTestComponents {
  component?: RouteComponent
  pendingComponent?: RouteComponent
  errorComponent?: false | null | undefined | ErrorRouteComponent
  notFoundComponent?: NotFoundRouteComponent
}

/** Overrides by route id, typed from the route tree. */
export type RouteTestOverrides<TRouteTree extends AnyRoute> =
  CoreRouteTestOverrides<TRouteTree, RouteTestComponents>

/** Defaults an application sets once for all of its route tests. */
export type RouterTestingDefaults<TRouteTree extends AnyRoute> =
  CoreRouterTestingDefaults<TRouteTree, RouteTestComponents>

/**
 * Renders the element a test hands over, for example `render` from
 * `@testing-library/react` or from `vitest-browser-react`.
 */
export type RouterTestingRenderFn = (ui: React.ReactElement) => unknown

/** Router options shared by every test router. */
export type TestRouterBaseOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
> = Omit<
  RouterOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    RouterHistory,
    Record<string, any>
  >,
  'routeTree' | 'history' | 'context'
>

export interface RouterTestingConfig<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TDefaults,
  TRender,
> {
  /** The application's route tree. Every test router is built from a copy. */
  routeTree: TRouteTree
  /**
   * Router options for every test router, such as `Wrap` for providers. The
   * tree, the history and the context are set per test.
   */
  routerOptions?: TestRouterBaseOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption
  >
  /**
   * Context values and overrides every test starts with. What is given here
   * becomes optional in each test.
   */
  // The intersection lets functions inside the defaults take their parameter
  // types from the route tree while `TDefaults` records what was given.
  defaults?: TDefaults & RouterTestingDefaults<TRouteTree>
  /**
   * The render function of the test library. Needed for `renderInRoute`.
   */
  render?: TRender
}

export type CreateTestRouterOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TDefaults,
  TLocation,
> = {
  /**
   * Where the router starts, typed like the options of `navigate`. Defaults
   * to `/`.
   */
  location?: ValidateNavigateOptions<
    Router<TRouteTree, TTrailingSlashOption, TDefaultStructuralSharingOption>,
    TLocation
  >
  /**
   * A history to start from instead of `location`, for entries that are not
   * valid navigation targets.
   */
  history?: RouterHistory
  /**
   * Per-route overrides. A route that is not listed keeps the application's
   * options.
   */
  routes?: RouteTestOverrides<TRouteTree>
} & TestRouterContextOption<TRouteTree, TDefaults>

export type RenderInRouteOptions<
  TRouteTree extends AnyRoute,
  TId,
  TDefaults,
> = RouteTestOptions<TRouteTree, TId, TDefaults>

export interface RenderInRouteResult<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRender,
> {
  router: Router<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption
  >
  /** What the configured `render` function returned. */
  result: TRender extends (...args: Array<any>) => infer TResult
    ? Awaited<TResult>
    : never
}

export interface RouterTesting<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TDefaults,
  TRender,
> {
  /**
   * Creates a router over a copy of the route tree. Every route runs the
   * application's own lifecycle unless `routes` replaces part of it.
   *
   * The router has not loaded yet. Render it with `RouterProvider`, or call
   * `router.load()` first when the test needs the first render to be complete.
   */
  createTestRouter: <const TLocation = unknown>(
    ...args: {} extends CreateTestRouterOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TDefaults,
      TLocation
    >
      ? [
          options?: CreateTestRouterOptions<
            TRouteTree,
            TTrailingSlashOption,
            TDefaultStructuralSharingOption,
            TDefaults,
            TLocation
          >,
        ]
      : [
          options: CreateTestRouterOptions<
            TRouteTree,
            TTrailingSlashOption,
            TDefaultStructuralSharingOption,
            TDefaults,
            TLocation
          >,
        ]
  ) => Router<TRouteTree, TTrailingSlashOption, TDefaultStructuralSharingOption>
  /**
   * Renders one element inside one route, with the route's state supplied by
   * the test.
   *
   * No `context`, `beforeLoad` or `loader` of any route runs, and no route
   * component renders. The options are typed from the route: they ask for
   * the context and the loader data those options would have produced.
   */
  renderInRoute: <const TId extends RouteIds<TRouteTree>>(
    element: React.ReactElement,
    options: RenderInRouteOptions<TRouteTree, TId, TDefaults>,
  ) => Promise<
    RenderInRouteResult<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRender
    >
  >
}

interface AnyRenderInRouteOptions {
  route: string
  params?: Record<string, unknown>
  search?: Record<string, unknown>
  context?: Record<string, unknown>
  loaderData?: unknown
  routes?: Record<string, { loaderData?: unknown } | undefined>
}

interface AnyCreateTestRouterOptions {
  location?: object
  history?: RouterHistory
  routes?: AnyRouteTestOverrides
  context?: Record<string, unknown>
}

interface AnyRouterTestingDefaults {
  context?: Record<string, unknown>
  routes?: AnyRouteTestOverrides
}

/**
 * Creates the test helpers for one application. Call it once, for example in
 * a `test-utils` file, with the application's route tree.
 *
 * ```tsx
 * import { render } from '@testing-library/react'
 * import { createRouterTesting } from '@tanstack/react-router/testing'
 * import { routeTree } from './routeTree.gen'
 *
 * export const { createTestRouter, renderInRoute } = createRouterTesting({
 *   routeTree,
 *   render,
 * })
 * ```
 */
export function createRouterTesting<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  const TDefaults = {},
  TRender extends RouterTestingRenderFn | undefined = undefined,
>(
  config: RouterTestingConfig<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TDefaults,
    TRender
  >,
): RouterTesting<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TDefaults,
  TRender
> {
  const defaults = config.defaults as AnyRouterTestingDefaults | undefined

  const createTestRouter = (options: AnyCreateTestRouterOptions = {}) => {
    const router = createRouter({
      ...config.routerOptions,
      routeTree: createTestRouteTree(
        config.routeTree,
        defaults?.routes,
        options.routes,
      ),
      history: options.history ?? createMemoryHistory(),
      context: { ...defaults?.context, ...options.context },
    } as any)

    if (options.location && !options.history) {
      setTestRouterLocation(router, options.location)
    }

    return router
  }

  const renderInRoute = async (
    element: React.ReactElement,
    options: AnyRenderInRouteOptions,
  ) => {
    const render = config.render
    if (!render) {
      throw new Error(
        'renderInRoute needs a render function. Pass `render` to createRouterTesting, for example the one from @testing-library/react.',
      )
    }

    const loaderData = new Map<string, unknown>()
    const seedLoaderData = (
      routes: Record<string, { loaderData?: unknown } | undefined> | undefined,
    ) => {
      for (const routeId in routes) {
        const seed = routes[routeId]
        if (seed && 'loaderData' in seed) {
          loaderData.set(routeId, seed.loaderData)
        }
      }
    }
    seedLoaderData(defaults?.routes)
    seedLoaderData(options.routes)
    if ('loaderData' in options) {
      loaderData.set(options.route, options.loaderData)
    }

    const router = createRouter({
      ...config.routerOptions,
      // Nothing of the application renders around the element, and an error
      // it throws reaches the test instead of an error component.
      defaultComponent: undefined,
      defaultErrorComponent: undefined,
      defaultPendingComponent: undefined,
      disableGlobalCatchBoundary: true,
      routeTree: createIsolatedRouteTree(config.routeTree, {
        routeId: options.route,
        component: () => element,
        loaderData,
      }),
      history: createMemoryHistory(),
      context: { ...defaults?.context, ...options.context },
    } as any)

    assertRouteTestParams(router, options.route, options.params)
    setTestRouterLocation(router, {
      to: router.routesById[options.route]!.fullPath,
      params: options.params,
      search: options.search,
    })
    await router.load()
    assertIsolatedRouteLoaded(router, options.route)

    const result = await render(<RouterProvider router={router} />)
    return { router, result }
  }

  return { createTestRouter, renderInRoute } as any
}
