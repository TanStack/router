import { afterEach, describe, expect, it, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { applyRouteHmr } from '../src/hmr'
import { fakeRouter, forgetRouters } from './route-hmr-fakes'
import type { RouteHmrAdapter, RouteHmrMeta } from '../src/hmr'

/**
 * When a route takes an evaluation of its route module: on Vite, for Solid
 * and Vue (`meta.hot`), once Vite reports the update applied
 * (`vite:afterUpdate`), after the accept callbacks where their refresh
 * patches components; and what a router whose document was lost during the
 * update gets (`_hmrReload`, set by a hydrated router's global boundary).
 * On a real page: router-plugin `route-hmr-browser-shape-change*.test.ts`,
 * start-plugin-core `start-dev-route-shape-change.test.ts`.
 */
describe('applyRouteHmr: when the route takes an evaluation', () => {
  afterEach(() => {
    forgetRouters()
    vi.unstubAllGlobals()
  })

  const root = new BaseRootRoute({})
  const evaluate = (token: string) =>
    new BaseRoute({
      getParentRoute: () => root,
      path: '/wait',
      loader: () => token,
    }) as any

  /** A fake of a module's Vite hot context: its listeners by event. */
  const viteHot = () => {
    const listeners = new Map<string, Set<() => void>>()
    return {
      listeners,
      hot: {
        on: (event: string, listener: () => void) => {
          let set = listeners.get(event)
          if (!set) {
            set = new Set()
            listeners.set(event, set)
          }
          set.add(listener)
        },
        off: (event: string, listener: () => void) => {
          listeners.get(event)?.delete(listener)
        },
      },
      afterUpdate: () => {
        for (const listener of [...(listeners.get('vite:afterUpdate') ?? [])]) {
          listener()
        }
      },
    }
  }

  /** A router holding the first evaluation of the route module `file`. */
  const held = (meta: RouteHmrMeta, adapter: RouteHmrAdapter) => {
    const first = evaluate('v0')
    root.addChildren([first])
    first.parentRoute = root
    const router = fakeRouter(() => ({ '/wait': first }))
    applyRouteHmr('/wait', first, meta, adapter)
    return { router, first }
  }

  it('Vite: the newest evaluation applies at vite:afterUpdate, once, and the listener goes', () => {
    const vite = viteHot()
    const meta = { file: '/src/routes/wait-vite.tsx', hot: vite.hot }
    const { router, first } = held(meta, {})
    applyRouteHmr('/wait', evaluate('v1'), meta, {})
    applyRouteHmr('/wait', evaluate('v2'), meta, {})
    expect(first.options.loader()).toBe('v0')
    expect(router._refreshRoute).not.toHaveBeenCalled()
    vite.afterUpdate()
    expect(first.options.loader()).toBe('v2')
    expect(router._refreshRoute).toHaveBeenCalledTimes(1)
    expect(vite.listeners.get('vite:afterUpdate')?.size).toBe(0)
  })

  it('a hydrated router whose document was lost during the update is left as it is without a refresh pass, and reloads after one; a client-only one updates', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const vite = viteHot()
    const meta = { file: '/src/routes/wait-lost.tsx', hot: vite.hot }
    const { router, first } = held(meta, {})
    // a hydrated router (`hydrate()` sets `ssr`)
    ;(router as any).ssr = {}
    applyRouteHmr('/wait', evaluate('v1'), meta, {})
    ;(router as any)._hmrReload = true
    vite.afterUpdate()
    expect(first.options.loader()).toBe('v0')
    expect(router._refreshRoute).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()

    // with a refresh pass (React): the reload the pass makes safe
    let react: ReturnType<typeof fakeRouter> | undefined
    const adapter: RouteHmrAdapter = {
      // the global boundary catches while the update applies
      settled: (apply) => {
        ;(react as any)._hmrReload = true
        apply()
      },
    }
    const clientOnly: RouteHmrAdapter = {
      // a client-only root's boundary: it recovers in place
      settled: (apply) => {
        ;(react as any)._hmrReload = true
        ;(react as any).ssr = undefined
        apply()
      },
    }
    const other = { file: '/src/routes/wait-lost-react.tsx' }
    const second = evaluate('w0')
    second.options.component = () => null
    root.addChildren([second])
    second.parentRoute = root
    react = fakeRouter(() => ({ '/wait': second }))
    applyRouteHmr('/wait', second, other, adapter)
    // (a component the refresh pass may patch: the route waits for it)
    const unmarked = evaluate('w1')
    unmarked.options.component = () => null
    applyRouteHmr('/wait', unmarked, other, clientOnly)
    expect(reload).not.toHaveBeenCalled()
    expect(react._refreshRoute).toHaveBeenCalledTimes(1)
    ;(react as any)._hmrReload = undefined
    ;(react as any).ssr = {}
    const next = evaluate('w2')
    next.options.component = () => null
    applyRouteHmr('/wait', next, other, adapter)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(react._refreshRoute).toHaveBeenCalledTimes(1)
  })
})
