import { afterEach, describe, expect, it } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { applyRouteChunkHmr, applyRouteHmr } from '../src/hmr'
import { fakeRouter, forgetRouters } from './route-hmr-fakes'
import type { RouteHmrAdapter } from '../src/hmr'

/**
 * `applyRouteHmr` and the routers of a page: which router's route an
 * evaluation of a route module updates (the one that holds a route this
 * file evaluated to), on a page whose route tree was rebuilt between two
 * edits (a route added or renamed regenerates the route tree, whose module
 * re-evaluates with the route module's current export, so the router holds
 * a later evaluation as the live route), and with two routers. That every
 * edit shows on a real page: router-plugin
 * `route-hmr-browser-two-routers.test.ts`, start-plugin-core
 * `route-edits-after-tree-rebuild*.test.ts`.
 */
describe('applyRouteHmr and the routers that hold the route', () => {
  afterEach(forgetRouters)

  const adapter: RouteHmrAdapter = { keep: () => false }
  const file = '/src/routes/page.tsx'
  const meta = { file }

  const root = new BaseRootRoute({})
  /** A fresh evaluation of the route module `/page` whose loader returns `token`. */
  const evaluate = (token: string) =>
    new BaseRoute({
      getParentRoute: () => root,
      path: '/page',
      loader: () => token,
    }) as any

  /**
   * A router whose `routesById` derives from a route tree; `tree['/page']`
   * is the route the tree module's last execution imported for `/page`.
   */
  const routerOf = (page: any, more: Record<string, any> = {}) => {
    root.addChildren([page])
    page.parentRoute = root
    const tree: Record<string, any> = { '/page': page, ...more }
    return { router: fakeRouter(() => ({ ...tree })), tree }
  }

  it('leaves a route of another evaluation lineage alone', () => {
    const first = evaluate('v0')
    const { router, tree } = routerOf(first)
    applyRouteHmr('/page', first, meta, adapter)
    // a tree holding a route this module never evaluated to (another router's)
    const foreign = evaluate('other')
    root.addChildren([foreign])
    foreign.parentRoute = root
    tree['/page'] = foreign
    router.setRoutes(router.buildRouteTree())
    applyRouteHmr('/page', evaluate('v1'), meta, adapter)
    expect(foreign.options.loader()).toBe('other')
    expect(router._refreshRoute).not.toHaveBeenCalled()
  })

  it('leaves alone the route another file evaluated to under the same id', () => {
    const first = evaluate('v0')
    const { router } = routerOf(first)
    applyRouteHmr('/page', first, meta, adapter)
    // an independently compiled file with a route of that id
    const other = { file: '/src/widget/routes/page.tsx' }
    applyRouteHmr('/page', evaluate('w0'), other, adapter)
    applyRouteHmr('/page', evaluate('w1'), other, adapter)
    expect(first.options.loader()).toBe('v0')
    expect(router._refreshRoute).not.toHaveBeenCalled()
  })

  it('updates the router that holds the route, whichever was created last, and each router of a tree two routers share', () => {
    const first = evaluate('v0')
    const { router } = routerOf(first)
    applyRouteHmr('/page', first, meta, adapter)
    // a second router of the same tree, and a third with a route of its own
    const { router: second } = routerOf(first)
    const others = evaluate('other')
    const third = fakeRouter(() => ({ '/page': others }))
    applyRouteHmr('/page', evaluate('v1'), meta, adapter)
    expect(first.options.loader()).toBe('v1')
    expect(router._refreshRoute).toHaveBeenCalledOnce()
    expect(second._refreshRoute).toHaveBeenCalledOnce()
    expect(others.options.loader()).toBe('other')
    expect(third._refreshRoute).not.toHaveBeenCalled()
  })

  // A route the rebuilt tree drops (removed or renamed) is forgotten: when a
  // route of that id returns, its split chunk's next evaluation is a first
  // one again (recorded, no load), as on a page that never had it.
  it('forgets the file of a route the rebuilt tree drops, unless another router holds a route of that id', () => {
    const gone = { file: '/src/routes/gone.tsx' }
    const run = (kept: boolean) => {
      const first = evaluate('v0')
      const goneRoute = { options: {} }
      const { router, tree } = routerOf(first, { '/gone': goneRoute })
      const keeper = kept ? fakeRouter(() => ({ '/gone': goneRoute })) : null
      applyRouteHmr('/page', first, meta, adapter)
      applyRouteHmr('/gone', goneRoute as any, gone, adapter)
      applyRouteChunkHmr(gone.file, 'loader', adapter)
      // the route tree module drops `/gone`; the router reads it on an edit
      delete tree['/gone']
      applyRouteHmr('/page', evaluate('v1'), meta, adapter)
      expect(router.routesById['/gone']).toBeUndefined()
      router._refreshRoute.mockClear()
      keeper?._refreshRoute.mockClear()
      applyRouteChunkHmr(gone.file, 'loader', adapter)
      forgetRouters()
      return keeper?._refreshRoute.mock.calls.length
    }
    // forgotten: the chunk's evaluation is a first one again
    expect(run(false)).toBeUndefined()
    // another router still holds the route: the chunk evaluated on its own
    expect(run(true)).toBe(1)
  })
})
