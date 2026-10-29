import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { applyRouteHmr } from '../src/hmr'
import type { RouteHmrAdapter } from '../src/hmr'

/**
 * `applyRouteHmr` on a page whose route tree was rebuilt between two edits
 * of a route module: a route added or renamed regenerates the route tree,
 * whose module re-evaluates with the route module's current export, so the
 * router holds a later evaluation as the live route. That every later edit
 * updates it: start-plugin-core `route-edits-after-tree-rebuild*.test.ts`
 * (real pages, Vite and Rsbuild). Here: a live route the module never
 * evaluated to is left alone.
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
    root.addChildren([page])
    page.parentRoute = root
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

  it('leaves a route of another evaluation lineage alone', () => {
    const first = evaluate('v0')
    const { router, tree } = routerOf(first)
    applyRouteHmr('/page', first, {}, adapter)
    // a tree holding a route this module never evaluated to (another router's)
    const foreign = evaluate('other')
    root.addChildren([foreign])
    foreign.parentRoute = root
    tree.page = foreign
    applyRouteHmr('/page', evaluate('v1'), {}, adapter)
    expect(foreign.options.loader()).toBe('other')
    expect(router._refreshRoute).not.toHaveBeenCalled()
  })
})
