// @vitest-environment jsdom

/**
 * Pending ruling Q5 (REPAIR/BRIEF, SYNTHESIS "Open decisions"): kept exactly
 * as it was until the oracle owner rules whether an update of a route the
 * live router does not have is reachable through real tools. It calls the
 * route HMR code the plugin emits (the stringified `handleRouteUpdate`)
 * with a route the live router (`window.__TSR_ROUTER__`) does not have, and
 * asserts that the router is left as it is and keeps navigating.
 *
 * The other updater-entry controls of main's file are deleted: the
 * real-page rows of integration/route-hmr-browser-updates.test.ts (and
 * integration/route-hmr-browser-metadata.test.ts:45 for head and scripts)
 * decide their concepts through real edits. This control reaches the
 * emitted update function through `getHandleRouteUpdateCode`, an internal
 * entry point (held by pending ruling Q5).
 */

import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '@tanstack/router-core'
import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '../../history/src'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { getHandleRouteUpdateCode } from '../src/core/hmr'
import type { AnyRoute, GetStoreConfig } from '@tanstack/router-core'

vi.mock('@tanstack/router-core/isServer', async (importOriginal) => ({
  ...(await importOriginal()),
  isServer: undefined,
}))

const getStoreConfig: GetStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn) => fn(),
})

function asAnyRoute<TRoute>(route: TRoute): TRoute & AnyRoute {
  return route as unknown as TRoute & AnyRoute
}

function createClientTestRouter<TRouteTree>(
  routeTree: TRouteTree,
  initialEntry: string,
) {
  return new RouterCore(
    {
      routeTree: asAnyRoute(routeTree),
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
      isServer: false,
      origin: 'http://localhost',
    },
    getStoreConfig,
  )
}

function withWindowRouter(router: RouterCore<any, any, any, any, any>) {
  const testWindow = globalThis.window as any
  const hadOwnRouter = Object.prototype.hasOwnProperty.call(
    testWindow,
    '__TSR_ROUTER__',
  )
  const previousRouter = testWindow.__TSR_ROUTER__
  testWindow.__TSR_ROUTER__ = router

  return () => {
    if (hadOwnRouter) {
      testWindow.__TSR_ROUTER__ = previousRouter
    } else {
      delete testWindow.__TSR_ROUTER__
    }
  }
}

/**
 * The route option keys the React framework plugins keep stable across hot
 * updates (the component options), as the compiler gives them to the
 * emitted `handleRouteUpdate`.
 */
const stableRouteOptionKeys = [
  ...new Set(
    (
      getFrameworkHmrCompilerPlugins({ targetFramework: 'react' }) ?? []
    ).flatMap((plugin) => plugin.getStableRouteOptionKeys?.() ?? []),
  ),
]

/** The emitted `handleRouteUpdate`, as the route HMR code calls it. */
const handleRouteUpdate = new Function(
  `return (${getHandleRouteUpdateCode(stableRouteOptionKeys)})`,
)() as (routeId: string, newRoute: AnyRoute) => void

/**
 * Applies a hot update of the route `routeId` to the live `router`: calls
 * the emitted `handleRouteUpdate` with the route the edited route file
 * creates (`createFileRoute(routeId)(options)`, or `createRootRoute(options)`
 * for the root), as the route module's HMR code does once the bundler gave
 * it the edited module. Returns that route, which holds the hot module's
 * `Route` export.
 */
function hotUpdateRoute(
  router: RouterCore<any, any, any, any, any>,
  routeId: string,
  options: Record<string, unknown> = {},
) {
  const Route = asAnyRoute(
    routeId === rootRouteId
      ? new BaseRootRoute(options as never)
      : new BaseRoute(options as never),
  )
  const restoreWindow = withWindowRouter(router)
  try {
    handleRouteUpdate(routeId, Route)
  } finally {
    restoreWindow()
  }
  return { Route }
}

/** The id the route tree gives the root route. */
const rootRouteId = '__root__'

describe('handleRouteUpdate', () => {
  // E.g. a page with several routers, or a route the live route tree does
  // not include: the update leaves the router as it is, and the live tree
  // keeps navigating.
  it('ignores an update of a route the live router does not have', async () => {
    const rootRoute = new BaseRootRoute({})
    const homeRoute = new BaseRoute({
      getParentRoute: () => asAnyRoute(rootRoute),
      path: '/home',
      loader: () => 'home',
    })
    const router = createClientTestRouter(
      rootRoute.addChildren([asAnyRoute(homeRoute)]),
      '/',
    )
    await router.load()
    expect(() =>
      hotUpdateRoute(router, '/hot', { loader: () => 'x' }),
    ).not.toThrow()
    expect(Object.keys(router.routesById).sort()).toEqual(
      [rootRoute.id, homeRoute.id].sort(),
    )
    await router.navigate({ to: '/home' })
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: homeRoute.id,
      loaderData: 'home',
    })
  })
})
