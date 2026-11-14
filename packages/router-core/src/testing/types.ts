import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRoute,
  BeforeLoadContextOptions,
  ContextAsyncReturnType,
  ContextReturnType,
  LoaderFnContext,
  RouteContextOptions,
} from '../route'
import type { RouteById, RouteIds } from '../routeInfo'
import type {
  RouterConstructorOptions,
  RouterCore,
  RouterOptions,
  TrailingSlashOption,
} from '../router'
import type { ValidateNavigateOptions } from '../typePrimitives'
import type { Awaitable, ConstrainLiteral } from '../utils'

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
 * - `beforeLoad`, `loader`, `context`: replace the route option of the same
 *   name. Each takes a function with the signature of the original.
 * - `loaderData`: a seed for the route's loader data. The route's loader does
 *   not run.
 * - `routeContext`: a seed for everything the route adds to the context.
 *   Neither the route's `context` option nor its `beforeLoad` runs.
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
  context?: RouteTestContextFn<TRoute>
  loaderData?: TRoute['types']['loaderData']
  routeContext?: TRoute['types']['routeContext']
}

/**
 * Overrides by route id. The root route's id is `rootRouteId`, used as a
 * computed key: `{ [rootRouteId]: { ... } }`.
 */
export type RouteTestOverrides<
  TRouteTree extends AnyRoute,
  TComponents = RouteTestComponents,
> = {
  [TId in RouteIds<TRouteTree>]?: RouteTestOverride<
    RouteById<TRouteTree, TId>,
    TComponents
  >
}

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

type BranchRoutes<TRoute> = TRoute | AncestorRoutes<TRoute>

type HasLoaderData<TRoute extends AnyRoute> =
  undefined extends TRoute['types']['loaderData'] ? false : true

/**
 * Loader data by route id for a route and the routes above it. A route whose
 * loader returns data needs an entry.
 */
type BranchLoaderData<TRoute extends AnyRoute> = {
  [TBranchRoute in BranchRoutes<TRoute> as HasLoaderData<TBranchRoute> extends true
    ? TBranchRoute['types']['id']
    : never]: TBranchRoute['types']['loaderData']
} & {
  [TBranchRoute in BranchRoutes<TRoute> as HasLoaderData<TBranchRoute> extends true
    ? never
    : TBranchRoute['types']['id']]?: TBranchRoute['types']['loaderData']
}

type IsolatedRouteStateFor<TRoute extends AnyRoute> = OptionalWhenEmpty<
  'params',
  TRoute['types']['allParams']
> &
  OptionalWhenEmpty<'search', TRoute['types']['fullSearchSchemaInput']> &
  OptionalWhenEmpty<'context', TRoute['types']['allContext']> &
  OptionalWhenEmpty<'loaderData', BranchLoaderData<TRoute>>

/**
 * The state an isolated route test supplies for the route `TId`. No route
 * option that does work runs in such a test, so the types ask for what those
 * options would have produced:
 *
 * - `params`: all path params of the route.
 * - `search`: search params, which still go through `validateSearch`.
 * - `context`: the whole context of the route.
 * - `loaderData`: loader data by route id, for the route and the routes above
 *   it whose loader returns data.
 */
export type IsolatedRouteState<
  TRouteTree extends AnyRoute,
  TId extends RouteIds<TRouteTree>,
> = {
  route: TId
} & IsolatedRouteStateFor<RouteById<TRouteTree, TId>>

/**
 * The options of `createTestRouter`: those of `createRouter`, plus the route
 * tree, a start location and per-route overrides. Framework packages pass
 * their component types as `TComponents`.
 */
export type TestRouterOptions<
  TRouteTree extends AnyRoute,
  TLocation = unknown,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
  TComponents = RouteTestComponents,
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
   * replaces the current entry of `history`. Without it, the router starts
   * at the current location of `history`: `/` for the default memory history.
   */
  location?: ValidateNavigateOptions<
    RouterCore<
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
  overrides?: RouteTestOverrides<TRouteTree, TComponents>
}

/**
 * The options of `createIsolatedTestRouter`. Framework packages pass the type
 * of the element under test as `TElement`.
 */
export type IsolatedTestRouterOptions<
  TRouteTree extends AnyRoute,
  TId,
  TElement,
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
  element: TElement
  // Checked here rather than in a constraint on `TId`: with a constraint,
  // TypeScript widens a constant such as `rootRouteId` while inferring.
  route: ConstrainLiteral<TId, RouteIds<TRouteTree>>
} & IsolatedRouteStateFor<RouteById<TRouteTree, TId>>
