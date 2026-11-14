import type {
  AnyRoute,
  BeforeLoadContextOptions,
  ContextAsyncReturnType,
  ContextReturnType,
  LoaderFnContext,
  RouteContextOptions,
} from '../route'
import type { AllContext, RouteById, RouteIds } from '../routeInfo'
import type { InferRouterContext } from '../router'
import type { Awaitable } from '../utils'

/**
 * The component options a test can replace on a route. Framework packages
 * pass their own component types.
 */
export interface RouteTestComponents {
  component?: unknown
  pendingComponent?: unknown
  errorComponent?: unknown
  notFoundComponent?: unknown
}

/** `true` when a value of this type holds nothing a test has to supply. */
type IsEmpty<TValue> = [TValue] extends [void | undefined | null]
  ? true
  : {} extends TValue
    ? true
    : false

type OrVoid<TValue> = IsEmpty<TValue> extends true ? TValue | void : TValue

type OptionalWhenEmpty<TKey extends PropertyKey, TValue> =
  IsEmpty<TValue> extends true
    ? { [K in TKey]?: TValue }
    : { [K in TKey]: TValue }

type OptionalWhenUndefined<
  TKey extends PropertyKey,
  TValue,
> = undefined extends TValue
  ? { [K in TKey]?: TValue }
  : { [K in TKey]: TValue }

/**
 * A replacement for a route's `beforeLoad`. It receives what the route's own
 * `beforeLoad` receives and has to return what that one returns.
 */
export type RouteTestBeforeLoadFn<TRoute extends AnyRoute> = (
  ctx: BeforeLoadContextOptions<
    any,
    TRoute['types']['parentRoute'],
    TRoute['types']['searchValidator'],
    TRoute['types']['params'],
    TRoute['types']['routerContext'],
    TRoute['types']['routeContextFn'],
    TRoute['types']['id'],
    any,
    any
  >,
) => Awaitable<OrVoid<ContextAsyncReturnType<TRoute['types']['beforeLoadFn']>>>

/**
 * A replacement for a route's `loader`. It receives what the route's own
 * loader receives and has to return the route's loader data.
 */
export type RouteTestLoaderFn<TRoute extends AnyRoute> = (
  ctx: LoaderFnContext<
    any,
    TRoute['types']['parentRoute'],
    TRoute['types']['id'],
    TRoute['types']['params'],
    TRoute['types']['loaderDeps'],
    TRoute['types']['routerContext'],
    TRoute['types']['routeContextFn'],
    TRoute['types']['beforeLoadFn'],
    any,
    any
  >,
) => Awaitable<
  | TRoute['types']['loaderData']
  | (undefined extends TRoute['types']['loaderData'] ? void : never)
>

/** A replacement for a route's `context` option. */
export type RouteTestContextFn<TRoute extends AnyRoute> = (
  ctx: RouteContextOptions<
    TRoute['types']['parentRoute'],
    TRoute['types']['params'],
    TRoute['types']['routerContext'],
    TRoute['types']['loaderDeps'],
    TRoute['types']['id']
  >,
) => OrVoid<ContextReturnType<TRoute['types']['routeContextFn']>>

/**
 * What a test can replace on one route. Everything is typed from the route.
 *
 * - `beforeLoad`, `loader`: a replacement for that option.
 * - `context`: a function replaces the route's `context` option. A value is a
 *   seed: it stands for everything the route adds to the context, and neither
 *   the route's `context` option nor its `beforeLoad` runs.
 * - `loaderData`: a seed. The route's loader does not run.
 * - The component options replace what the route renders.
 *
 * The options derived from the URL (`params`, `validateSearch`, `loaderDeps`)
 * cannot be replaced.
 */
export type RouteTestOverride<
  TRoute extends AnyRoute,
  TComponents = RouteTestComponents,
> = TComponents & {
  beforeLoad?: RouteTestBeforeLoadFn<TRoute>
  loader?: RouteTestLoaderFn<TRoute>
  loaderData?: TRoute['types']['loaderData']
  context?: TRoute['types']['routeContext'] | RouteTestContextFn<TRoute>
}

/** Overrides by route id. */
export type RouteTestOverrides<
  TRouteTree extends AnyRoute,
  TComponents = RouteTestComponents,
> = {
  [TId in RouteIds<TRouteTree>]?: RouteTestOverride<
    RouteById<TRouteTree, TId>,
    TComponents
  >
}

/**
 * Defaults an application sets once for all of its route tests.
 */
export interface RouterTestingDefaults<
  TRouteTree extends AnyRoute,
  TComponents = RouteTestComponents,
> {
  /**
   * Context values every test router starts with. A key given here becomes
   * optional in the `context` of each test.
   */
  context?: AllContext<TRouteTree>
  /**
   * Overrides every test router starts with. A test's own override for a
   * route wins, option by option. An isolated route test takes only the
   * `loaderData` seeds from here.
   */
  routes?: RouteTestOverrides<TRouteTree, TComponents>
}

type DefaultContextKeys<TDefaults> = TDefaults extends {
  context: infer TContext
}
  ? keyof TContext
  : never

type DefaultLoaderDataIds<TDefaults> = TDefaults extends {
  routes: infer TRoutes
}
  ? {
      [TId in keyof TRoutes]: TRoutes[TId] extends { loaderData: any }
        ? TId
        : never
    }[keyof TRoutes]
  : never

/** Makes the keys optional that the application's defaults already provide. */
type WithDefaults<TValue, TDefaultKeys> = [TValue] extends [
  void | undefined | null,
]
  ? TValue
  : [TDefaultKeys & keyof TValue] extends [never]
    ? TValue
    : Omit<TValue, TDefaultKeys & keyof TValue> &
        Partial<Pick<TValue, TDefaultKeys & keyof TValue>>

/** The `context` option of a test router: the router context minus the defaults. */
export type TestRouterContextOption<
  TRouteTree extends AnyRoute,
  TDefaults = {},
> = OptionalWhenEmpty<
  'context',
  WithDefaults<InferRouterContext<TRouteTree>, DefaultContextKeys<TDefaults>>
>

type AncestorRoutes<TRoute> = TRoute extends {
  types: { parentRoute: infer TParentRoute }
}
  ? // The parent of a root route is `any`.
    unknown extends TParentRoute
    ? never
    : TParentRoute extends AnyRoute
      ? TParentRoute | AncestorRoutes<TParentRoute>
      : never
  : never

type RequiresLoaderData<
  TRoute extends AnyRoute,
  TDefaults,
> = undefined extends TRoute['types']['loaderData']
  ? false
  : TRoute['types']['id'] extends DefaultLoaderDataIds<TDefaults>
    ? false
    : true

type AncestorLoaderData<TRoute extends AnyRoute, TDefaults> = {
  [TAncestor in AncestorRoutes<TRoute> as RequiresLoaderData<
    TAncestor,
    TDefaults
  > extends true
    ? TAncestor['types']['id']
    : never]: { loaderData: TAncestor['types']['loaderData'] }
} & {
  [TAncestor in AncestorRoutes<TRoute> as RequiresLoaderData<
    TAncestor,
    TDefaults
  > extends true
    ? never
    : TAncestor['types']['id']]?: {
    loaderData?: TAncestor['types']['loaderData']
  }
}

type RouteTestStateFor<TRoute extends AnyRoute, TDefaults> = OptionalWhenEmpty<
  'params',
  TRoute['types']['allParams']
> &
  OptionalWhenEmpty<'search', TRoute['types']['fullSearchSchemaInput']> &
  OptionalWhenEmpty<
    'context',
    WithDefaults<TRoute['types']['allContext'], DefaultContextKeys<TDefaults>>
  > &
  (TRoute['types']['id'] extends DefaultLoaderDataIds<TDefaults>
    ? { loaderData?: TRoute['types']['loaderData'] }
    : OptionalWhenUndefined<'loaderData', TRoute['types']['loaderData']>) &
  OptionalWhenEmpty<'routes', AncestorLoaderData<TRoute, TDefaults>>

/**
 * The state an isolated route test supplies for the route `TId`. No route
 * option that does work runs in such a test, so the types ask for what those
 * options would have produced:
 *
 * - `params`: all path params of the route.
 * - `search`: search params, which still go through `validateSearch`.
 * - `context`: the merged context of the route, minus the defaults.
 * - `loaderData`: the route's loader data.
 * - `routes`: loader data of the ancestors whose loader returns something.
 */
export type RouteTestOptions<
  TRouteTree extends AnyRoute,
  TId,
  TDefaults = {},
> = { route: TId } & RouteTestStateFor<RouteById<TRouteTree, TId>, TDefaults>
