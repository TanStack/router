import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { applyRouteHmr } from '../src/hmr'
import type { RouteHmrAdapter } from '../src/hmr'

/**
 * `applyRouteHmr` on a page whose route tree was rebuilt between two edits
 * of a route module: a route added or renamed regenerates the route tree,
 * whose module re-evaluates with the route module's current export (the
 * last evaluation, not the first one the runtime recorded), so the router
 * holds that later route as the live one. Every later edit must still
 * update the live route.
 */
describe('applyRouteHmr after a route tree rebuild', () => {
  afterEach(() => {
    delete (window as any).__TSR_ROUTER__
  })

  const adapter: RouteHmrAdapter = {
    keep: () => false,
    keepUnsplit: () => false,
  }

  const root = new BaseRootRoute({})
  /** A fresh evaluation of the route module `/page` whose loader returns `token`. */
  const evaluate = (token: string) =>
    new BaseRoute({
      getParentRoute: () => root,
      path: '/page',
      loader: () => token,
    }) as any

  /**
   * A router whose `routesById` derives from a route tree (`setRoutes(buildRouteTree())`,
   * as the router does); `tree.page` is the route the tree module's last
   * execution imported for `/page`.
   */
  const routerOf = (page: any) => {
    const tree = { page }
    const router = {
      routesById: { '/page': page } as Record<string, any>,
      buildRouteTree: () => ({ routesById: { '/page': tree.page } }),
      setRoutes(caches: { routesById: Record<string, any> }) {
        this.routesById = caches.routesById
      },
      _refreshRoute: vi.fn(() => Promise.resolve()),
    }
    ;(window as any).__TSR_ROUTER__ = router
    return { router, tree }
  }

  it('updates the route a rebuilt tree holds (a later evaluation than the first)', () => {
    const first = evaluate('v0')
    const { router, tree } = routerOf(first)
    applyRouteHmr('/page', first, {}, adapter)

    // first edit: the first route is live and gets the new loader
    const second = evaluate('v1')
    applyRouteHmr('/page', second, {}, adapter)
    expect(router.routesById['/page']).toBe(first)
    expect(first.options.loader()).toBe('v1')
    expect(router._refreshRoute).toHaveBeenCalledTimes(1)

    // the route tree module re-executes (a route added): it imports the
    // route module's current export, `second`; the router has not read it
    tree.page = second

    // second edit: the tree's route must get the new loader and be the live one
    const third = evaluate('v2')
    applyRouteHmr('/page', third, {}, adapter)
    expect(router.routesById['/page']).toBe(second)
    expect(second.options.loader()).toBe('v2')
    expect(router._refreshRoute).toHaveBeenCalledTimes(2)

    // a third edit without a tree rebuild updates that same route
    applyRouteHmr('/page', evaluate('v3'), {}, adapter)
    expect(router.routesById['/page']).toBe(second)
    expect(second.options.loader()).toBe('v3')
  })

  it('leaves a route of another evaluation lineage alone', () => {
    const first = evaluate('v0')
    const { router, tree } = routerOf(first)
    applyRouteHmr('/page', first, {}, adapter)
    // a tree holding a route this module never evaluated to (another router's)
    const foreign = evaluate('other')
    tree.page = foreign
    applyRouteHmr('/page', evaluate('v1'), {}, adapter)
    expect(foreign.options.loader()).toBe('other')
    expect(router._refreshRoute).not.toHaveBeenCalled()
  })
})
