import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { LazyRouteComponentHot } from '../src/hmr'

/**
 * What the route HMR runtime uses of a router, registered as a router of
 * the page is in development (`window.__TSR_ROUTERS__`). `tree()` answers
 * the routes the route tree holds now (what `buildRouteTree` reads).
 */
export interface FakeRouter {
  routesById: Record<string, any>
  buildRouteTree: () => { routesById: Record<string, any> }
  setRoutes: (caches: { routesById: Record<string, any> }) => void
  stores: { matches: { get: () => Array<object> }; setMatches: Mock }
  _replaceRouteChunk: Mock
  _refreshRoute: Mock<() => Promise<void>>
}

export function fakeRouter(tree: () => Record<string, any>): FakeRouter {
  const router: FakeRouter = {
    routesById: tree(),
    buildRouteTree: () => ({ routesById: tree() }),
    setRoutes(caches: { routesById: Record<string, any> }) {
      this.routesById = caches.routesById
    },
    stores: {
      matches: { get: () => [] as Array<object> },
      setMatches: vi.fn(),
    },
    _replaceRouteChunk: vi.fn(),
    _refreshRoute: vi.fn(() => Promise.resolve()),
  }
  ;((window as any).__TSR_ROUTERS__ ??= []).push(new WeakRef(router))
  return router
}

/** Forgets the routers earlier tests registered. */
export function forgetRouters() {
  delete (window as any).__TSR_ROUTERS__
}

/** A lazy wrapper's state behind the hot slot its framework builds, and the wrapper. */
export function fakeWrapper(
  held?: unknown,
  error?: unknown,
  /** `null`: none (the default export) */
  exportName: string | null = 'component',
) {
  const state = {
    importer: (() => Promise.resolve({})) as () => Promise<
      Record<string, unknown>
    >,
    exportName: exportName ?? undefined,
    comp: held,
    error,
    pending: undefined as Promise<unknown> | undefined,
    renders: 0,
  }
  const slot: LazyRouteComponentHot = {
    importer: state.importer,
    exportName: state.exportName,
    retarget: (importer, name) => {
      state.importer = importer
      state.exportName = name
      return (
        state.comp !== undefined || state.pending !== undefined || !!state.error
      )
    },
    pending: () => state.pending,
    setPending: (promise) => {
      state.pending = promise
    },
    held: () => state.comp,
    settle: (comp, err) => {
      state.comp = comp
      state.error = err
      state.renders++
    },
  }
  return { state, wrapper: { __tsrHot: slot } as Record<string, any> }
}
