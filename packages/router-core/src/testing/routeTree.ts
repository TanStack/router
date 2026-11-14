import { SEGMENT_TYPE_PARAM } from '../new-process-route-tree'
import type { AnyRoute } from '../route'
import type { AnyRouter } from '../router'

type RouteOptionsPatch = Record<string, unknown>

/**
 * The untyped shape of a per-route override. The typed shape that tests use
 * is `RouteTestOverride` in `./types`.
 */
export interface AnyRouteTestOverride {
  beforeLoad?: unknown
  loader?: unknown
  context?: unknown
  loaderData?: unknown
  routeContext?: unknown
  component?: unknown
  pendingComponent?: unknown
  errorComponent?: unknown
  notFoundComponent?: unknown
}

export type AnyRouteTestOverrides = Record<
  string,
  AnyRouteTestOverride | undefined
>

/** Override keys that replace the route option of the same name. */
const replacedOptions = [
  'beforeLoad',
  'loader',
  'context',
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
] as const

/**
 * Everything an isolated route test removes from every route: the options
 * that do work, the options that render, and the options that react to the
 * lifecycle. The options derived from the URL (`params`, `validateSearch`,
 * `search`, `loaderDeps`) stay.
 */
const isolatedRouteOptions: RouteOptionsPatch = {
  beforeLoad: undefined,
  context: undefined,
  loader: undefined,
  component: undefined,
  pendingComponent: undefined,
  errorComponent: undefined,
  notFoundComponent: undefined,
  shellComponent: undefined,
  head: undefined,
  scripts: undefined,
  headers: undefined,
  onEnter: undefined,
  onStay: undefined,
  onLeave: undefined,
  onError: undefined,
  onCatch: undefined,
}

function getChildren(route: AnyRoute): Array<AnyRoute> | undefined {
  return route.children as Array<AnyRoute> | undefined
}

/**
 * Gives every route of a tree its `id`, `path`, `fullPath` and `to`.
 *
 * A router does this for the tree it is built from, every time one is
 * created. A test router is built from a copy of the tree, so without this
 * step the route objects that application code imports would never be
 * initialised: `Route.to` would be `undefined` and `Route.useLoaderData()`
 * would fall back to the nearest match.
 */
export function initRouteTree(routeTree: AnyRoute): void {
  let index = 0
  const visit = (route: AnyRoute) => {
    route.init(index++)
    getChildren(route)?.forEach(visit)
  }
  visit(routeTree)
}

function cloneRouteTree<TRouteTree extends AnyRoute>(
  routeTree: TRouteTree,
  getPatch: (route: AnyRoute) => RouteOptionsPatch | undefined,
  keepLazyRoutes: boolean,
): TRouteTree {
  const cloneRoute = (route: AnyRoute, parent?: AnyRoute): AnyRoute => {
    const patch = getPatch(route)
    // Route classes take all their state from `options`, so a fresh instance
    // of the same class with copied options is an independent route.
    const clone = new (route.constructor as new () => AnyRoute)()
    clone.options = { ...route.options, ...patch }
    if (parent) {
      clone.options.getParentRoute = () => parent
    }
    clone.isRoot = route.isRoot

    const lazyFn = route.lazyFn
    if (lazyFn && keepLazyRoutes) {
      // Lazy options are assigned onto the route when they arrive. The test's
      // own options have to win over them.
      clone.lazyFn = patch
        ? () =>
            lazyFn().then(
              (lazyRoute) =>
                ({
                  options: { ...lazyRoute.options, ...patch },
                }) as typeof lazyRoute,
            )
        : lazyFn
    }

    const children = getChildren(route)
    if (children) {
      clone.addChildren(children.map((child) => cloneRoute(child, clone)))
    }
    return clone
  }

  return cloneRoute(routeTree) as TRouteTree
}

function collectRouteIds(routeTree: AnyRoute, ids = new Set<string>()) {
  ids.add(routeTree.id)
  getChildren(routeTree)?.forEach((child) => collectRouteIds(child, ids))
  return ids
}

function assertKnownRouteIds(routeTree: AnyRoute, ids: Iterable<string>) {
  let known: Set<string> | undefined
  for (const id of ids) {
    known ??= collectRouteIds(routeTree)
    if (!known.has(id)) {
      throw new Error(
        `The route "${id}" does not exist in the route tree. Known route ids: ${[...known].join(', ')}`,
      )
    }
  }
}

function applyOverride(
  routeId: string,
  override: AnyRouteTestOverride,
): RouteOptionsPatch {
  const conflict =
    'loader' in override && 'loaderData' in override
      ? ['loader', 'loaderData']
      : 'routeContext' in override && 'context' in override
        ? ['context', 'routeContext']
        : 'routeContext' in override && 'beforeLoad' in override
          ? ['beforeLoad', 'routeContext']
          : undefined
  if (conflict) {
    throw new Error(
      `The override for route "${routeId}" has both "${conflict[0]}" and "${conflict[1]}". Pass one of them.`,
    )
  }
  if (
    override.context !== undefined &&
    typeof override.context !== 'function'
  ) {
    throw new Error(
      `The override for route "${routeId}" passes a value as "context", which replaces the route's \`context\` option and has to be a function. To seed what the route adds to the context, use "routeContext".`,
    )
  }

  const patch: RouteOptionsPatch = {}
  for (const key of replacedOptions) {
    if (key in override) {
      patch[key] = override[key]
    }
  }
  if ('loaderData' in override) {
    const loaderData = override.loaderData
    patch.loader = () => loaderData
  }
  if ('routeContext' in override) {
    // The seed stands for everything the route adds to the context, so
    // neither of the two options that produce it may run.
    const routeContext = override.routeContext
    patch.context = () => routeContext
    patch.beforeLoad = undefined
  }
  return patch
}

/**
 * Copies a route tree for one test router and applies per-route overrides.
 * Routes without an override keep the application's options.
 */
export function createTestRouteTree<TRouteTree extends AnyRoute>(
  routeTree: TRouteTree,
  overrides?: AnyRouteTestOverrides,
): TRouteTree {
  initRouteTree(routeTree)
  if (overrides) {
    assertKnownRouteIds(routeTree, Object.keys(overrides))
  }

  return cloneRouteTree(
    routeTree,
    (route) => {
      const override = overrides?.[route.id]
      return override ? applyOverride(route.id, override) : undefined
    },
    true,
  )
}

export interface IsolatedRouteTreeOptions {
  /** The route the element under test is rendered in. */
  routeId: string
  /** The component that renders the element under test. */
  component: unknown
  /** Loader data by route id. A route that is not listed has no loader. */
  loaderData: ReadonlyMap<string, unknown>
}

/**
 * Copies a route tree for an isolated route test. No route keeps an option
 * that does work or renders. The target route renders `component`, and the
 * listed routes get a loader that returns the given data.
 */
export function createIsolatedRouteTree<TRouteTree extends AnyRoute>(
  routeTree: TRouteTree,
  options: IsolatedRouteTreeOptions,
): TRouteTree {
  initRouteTree(routeTree)
  assertKnownRouteIds(routeTree, [
    options.routeId,
    ...options.loaderData.keys(),
  ])

  return cloneRouteTree(
    routeTree,
    (route) => {
      const patch = { ...isolatedRouteOptions }
      if (options.loaderData.has(route.id)) {
        const loaderData = options.loaderData.get(route.id)
        patch.loader = () => loaderData
      }
      if (route.id === options.routeId) {
        patch.component = options.component
      }
      return patch
    },
    false,
  )
}

/**
 * Moves a router that has not loaded yet to a location given as navigation
 * options (`to`, `params`, `search`, `hash`, `state`).
 */
export function setTestRouterLocation(
  router: AnyRouter,
  location: object,
): void {
  const next = router.buildLocation(location as never)
  router.history.replace(next.publicHref, next.state)
  router.updateLatestLocation()
}

/**
 * Throws when navigation options for `routeId` leave a required path param
 * out. Without this the param would be written into the URL as "undefined".
 */
export function assertRouteTestParams(
  router: AnyRouter,
  routeId: string,
  params: Record<string, unknown> | undefined,
): void {
  const route = (router.routesById as Record<string, AnyRoute>)[routeId]!
  const missing: Array<string> = []
  for (const segment of route._interpolation ?? []) {
    if (
      typeof segment !== 'string' &&
      segment[0] === SEGMENT_TYPE_PARAM &&
      params?.[segment[1]] == null
    ) {
      missing.push(segment[1])
    }
  }
  if (missing.length) {
    throw new Error(
      `Missing path params for route "${routeId}": ${missing.join(', ')}.`,
    )
  }
}

/**
 * Throws when an isolated route test did not end up where the test asked:
 * the target route is not matched, or a match failed, for example because
 * the search params did not pass the route's `validateSearch`.
 */
export function assertIsolatedRouteLoaded(
  router: AnyRouter,
  routeId: string,
): void {
  const matches = router.state.matches
  const href = router.state.location.href

  for (const match of matches) {
    if (match.status === 'error') {
      throw match.error instanceof Error
        ? match.error
        : new Error(
            `The route "${match.routeId}" failed to load at "${href}": ${String(match.error)}`,
          )
    }
  }

  const matched = matches.some(
    (match) => match.routeId === routeId && match.status === 'success',
  )
  if (!matched) {
    throw new Error(
      `The route "${routeId}" is not matched at "${href}". Matched routes: ${matches.map((match) => match.routeId).join(', ') || 'none'}. Pass the id of a route that its own path leads to; a layout route is reached through one of its child routes.`,
    )
  }
}
