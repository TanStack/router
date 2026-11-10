import { isServer } from '@tanstack/router-core/isServer'
import type { AnyRoute } from './route'
import type { AnyRouter } from './router'

/**
 * Static facts the compiler's dev-only route HMR block passes for one
 * evaluation of a route module.
 *
 * Called only by compiler output; not a public API.
 */
export interface RouteHmrMeta {
  /** The module is a lazy route file: its `Route` holds the options the route of its id loads with its chunk. */
  lazy?: true
  /** Refresh identities of the component options left in the route module (a binding's name, `<specifier>#<export>` for an import); an option without one is swapped. */
  unsplit?: Record<string, string>
  /** React + Vite: the module id plugin-react uses and the export names it ignores (the route, the anchor, every module-level binding name the user does not export). */
  refreshExports?: { id: string; anchor: string; exports: Array<string> }
}

/**
 * Decides, per framework, whether a held component is kept because the
 * framework's refresh runtime patches it in place. Not a public API.
 */
export interface RouteHmrAdapter {
  /** Split component: decided when the re-imported chunk resolves, from the loaded export. */
  keep: (next: any, held: any) => boolean
  /** Unsplit component: both values come from the same module in the same round. */
  keepUnsplit: (next: any, held: any, sameName: boolean) => boolean
  /** Forgets what the framework records for a route id the router no longer holds. */
  retire?: (routeId: string) => void
}

/**
 * Dev-only hot slot of a lazy route component (`lazyRouteComponent(...).__tsrHot`),
 * present on the client only (`lazyRouteComponentHot`). Not a public API.
 */
export interface LazyRouteComponentHot {
  /** The importer and export name the wrapper was created with. */
  readonly importer: () => Promise<any>
  readonly exportName: string | undefined
  /** Points the wrapper at a new importer (see `lazyRouteComponentHot`). */
  update: (
    importer: () => Promise<any>,
    exportName: string | undefined,
    keep: RouteHmrAdapter['keep'],
  ) => void
}

/**
 * What the hot slot of a lazy route component reads and changes in its
 * framework's wrapper (built in the wrapper's dev-only block).
 */
export interface LazyRouteComponentPort {
  /** Points the wrapper's later loads at `importer`; whether the wrapper has loaded, is loading or failed. */
  retarget: (
    importer: () => Promise<any>,
    exportName: string | undefined,
  ) => boolean
  /** The wrapper's load in flight (what its `preload()` returns), if any. */
  pending: () => Promise<any> | undefined
  setPending: (promise: Promise<any> | undefined) => void
  /** The component the wrapper holds (`undefined` or `null`: none). */
  held: () => any
  /** Holds `component` and `error` (none: `undefined`), and re-renders the wrapper. */
  settle: (component: any, error: unknown) => void
}

/**
 * The hot slot of a lazy route component, with the framework's own fields
 * (`extra`). `update` re-imports through the new importer when the wrapper
 * has loaded (or is loading), then keeps the held component if
 * `keep(loaded, held)` says so (the framework's refresh runtime patches it
 * in place) or swaps to the loaded one, and re-renders the wrapper either
 * way (a failure it held is over). The newest import is the only one
 * whose completion counts: an older one that completes while a newer one is
 * pending settles with the newer one. A wrapper that never loaded only takes
 * the new importer for its first load.
 *
 * Dev-only, called by the framework packages' `lazyRouteComponent` on the
 * client; not a public API.
 */
export function lazyRouteComponentHot<TExtra extends object>(
  importer: () => Promise<any>,
  exportName: string | undefined,
  port: LazyRouteComponentPort,
  extra: TExtra,
): LazyRouteComponentHot & TExtra {
  return {
    ...extra,
    importer,
    exportName,
    update: (nextImporter, nextExportName, keep) => {
      if (!port.retarget(nextImporter, nextExportName)) {
        return
      }
      const promise: Promise<any> = nextImporter().then(
        (res) => {
          if (port.pending() !== promise) {
            return port.pending()
          }
          port.setPending(undefined)
          const next = res[nextExportName ?? 'default']
          const held = port.held()
          // a kept component stays (its refresh runtime patches it); either
          // way a failure the wrapper held is over
          port.settle(
            held == null || !keep(next, held) ? next : held,
            undefined,
          )
          return port.held()
        },
        (err) => {
          if (port.pending() !== promise) {
            return port.pending()
          }
          port.setPending(undefined)
          port.settle(port.held(), err)
          return undefined
        },
      )
      port.setPending(promise)
    },
  }
}

type HotRoute = AnyRoute & {
  options: Record<string, any>
  parentRoute: AnyRoute
  _path: string
  _id: string
  _fullPath: string
  _to: string
}

const componentKeys = [
  'component',
  'shellComponent',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
]

// Generated by the route tree, absent from a freshly evaluated route module.
const generatedOptionKeys = ['id', 'path', 'getParentRoute']

// Every `Route` each route id evaluated to (a route tree rebuilt after an
// edit imports the module's current export, so any evaluation can be the
// router's live route) and the facts of the module that the live route
// currently reflects. Bounded by the number of routes (`setRoutes` forgets
// the ids a rebuilt tree drops); the evaluations are held weakly.
const hotRoutes = new Map<
  string,
  { routes: WeakSet<AnyRoute>; meta: RouteHmrMeta }
>()

// Per route id, the split chunks that evaluated since its route module last
// did (`applyRouteChunkHmr`). Bounded by the number of split chunks.
const hotChunks = new Map<string, Set<string>>()

/**
 * What the route HMR runtime uses of a webpack-style module's hot handle
 * (`import.meta.webpackHot`). Not a public API.
 */
export interface KeptReaderHot {
  invalidate: () => void
  dispose: (callback: () => void) => void
  status: () => string
  addStatusHandler: (handler: (status: string) => void) => void
}

// Per route id, the hot handles of the evaluated modules of its file that
// read a binding its route module keeps (`applyKeptReaderHmr`); a module
// leaves when it is disposed. Bounded by the number of derived modules.
const keptReaders = new Map<string, Set<KeptReaderHot>>()

// Per route id, the latest evaluation of a route module that invalidated its
// kept readers: the route is refreshed with it once the update is applied
// (`deferUntilApplied`).
const deferred = new Map<
  string,
  { route: AnyRoute; meta: RouteHmrMeta; adapter: RouteHmrAdapter }
>()
let statusHandled = false

/**
 * Has the router read its route tree again, then forgets the route ids it
 * held before and no longer holds (a route removed or renamed). An id the
 * router never held stays: a module evaluates before the route tree module
 * that adds its route runs.
 */
function setRoutes(router: AnyRouter, adapter: RouteHmrAdapter): void {
  const before = router.routesById as Record<string, AnyRoute>
  router.setRoutes(router.buildRouteTree())
  for (const routeId in before) {
    if (!(routeId in router.routesById)) {
      hotRoutes.delete(routeId)
      hotLazyRoutes.delete(routeId)
      hotChunks.delete(routeId)
      keptReaders.delete(routeId)
      adapter.retire?.(routeId)
    }
  }
}

/**
 * Applies one evaluation of a route module to the live route of
 * `window.__TSR_ROUTER__`. The first evaluation only records the route.
 * Later evaluations update the live route when the router on the page holds
 * a route this module evaluated to under `routeId` (the first one, or a
 * later one a rebuilt route tree imported), and do nothing otherwise.
 *
 * Not a public API: called by the framework packages' `__tsrRouteHmr`.
 */
export function applyRouteHmr(
  routeId: string,
  route: AnyRoute,
  meta: RouteHmrMeta,
  adapter: RouteHmrAdapter,
): void {
  if (process.env.NODE_ENV !== 'production') {
    if (isServer ?? typeof window === 'undefined') {
      return
    }
    if (meta.lazy) {
      applyLazyRouteHmr(
        routeId,
        route as unknown as LazyRouteEvaluation,
        meta,
        adapter,
      )
      return
    }
    // this evaluation owns the refresh: the route's chunks the refresh
    // re-imports evaluate as new (`applyRouteChunkHmr`)
    hotChunks.delete(routeId)
    const known = hotRoutes.get(routeId)
    if (!known) {
      hotRoutes.set(routeId, { routes: new WeakSet([route]), meta })
      return
    }
    known.routes.add(route)
    const waiting = deferred.get(routeId)
    if (waiting) {
      // evaluated again within the same update (an invalidated reader's
      // update bubbles up to it): the refresh takes the latest evaluation
      waiting.route = route
      waiting.meta = meta
      return
    }
    const readers = keptReaders.get(routeId)
    const hot: KeptReaderHot | undefined = readers?.values().next().value
    // the modules reading what this module kept read its earlier
    // evaluation; invalidated while the update applies, they leave the
    // module cache in the same update, and the refresh re-imports them
    if (hot && hot.status() === 'apply') {
      for (const reader of readers!) {
        reader.invalidate()
      }
      deferred.set(routeId, { route, meta, adapter })
      if (!statusHandled) {
        // one handler for the page's lifetime: status handlers are the
        // runtime's, whatever module registered them
        statusHandled = true
        hot.addStatusHandler(onStatus)
      }
      return
    }
    refreshRoute(routeId, route, meta, adapter, known)
  }
}

/** A lazy route file's `Route` (`createLazyFileRoute(id)(options)`). */
interface LazyRouteEvaluation {
  options: { id: string } & Record<string, any>
}

// Per route id, the last evaluation of its lazy route file and its facts.
// Bounded by the number of lazy route files.
const hotLazyRoutes = new Map<
  string,
  { route: LazyRouteEvaluation; meta: RouteHmrMeta }
>()

/**
 * Applies one evaluation of a lazy route file to the live route of its id.
 * The route loads its lazy options from this evaluation from now on (the
 * route tree's `import()` of the file keeps answering the module it first
 * loaded); a route that loaded the earlier evaluation's options takes the
 * new ones in place: a component keeps its held value when the framework
 * patches it (`keepUnsplit`, as for a route module), and the options the
 * edit removed leave the route (an option the route file sets too goes
 * with them). The first evaluation only records itself.
 */
function applyLazyRouteHmr(
  routeId: string,
  lazy: LazyRouteEvaluation,
  meta: RouteHmrMeta,
  adapter: RouteHmrAdapter,
): void {
  if (process.env.NODE_ENV !== 'production') {
    const known = hotLazyRoutes.get(routeId)
    hotLazyRoutes.set(routeId, { route: lazy, meta })
    const router = window.__TSR_ROUTER__
    const live = router?.routesById?.[routeId] as HotRoute | undefined
    if (!known || !router || !live) {
      return
    }
    if (router._hmrReload) {
      window.location.reload()
      return
    }
    const state = live._lazy
    router._replaceRouteChunk?.(live, () => Promise.resolve(lazy as any))
    if (state === undefined) {
      // not loaded: its first load takes this evaluation
      return
    }
    if (state !== true) {
      // loading the earlier evaluation, which the router now drops: the
      // refresh loads this one
      void router._refreshRoute?.()
      return
    }
    const { id: _id, ...next } = lazy.options
    const { id: _previousId, ...previous } = known.route.options
    for (const key in previous) {
      if (!(key in next)) {
        delete live.options[key]
      }
    }
    for (const key of componentKeys) {
      const held = live.options[key]
      const value = next[key]
      if (
        held !== undefined &&
        value !== undefined &&
        held !== value &&
        adapter.keepUnsplit(
          value,
          held,
          meta.unsplit?.[key] !== undefined &&
            meta.unsplit[key] === known.meta.unsplit?.[key],
        )
      ) {
        next[key] = held
      }
    }
    live.update(next)
    live._lazy = true
    void router._refreshRoute?.()
  }
}

/** Refreshes the routes deferred during an update once it is applied; drops them when it failed (the page reloads). */
function onStatus(status: string): void {
  if (status !== 'idle' && status !== 'fail' && status !== 'abort') {
    return
  }
  const entries = [...deferred]
  deferred.clear()
  if (status !== 'idle') {
    return
  }
  for (const [routeId, { route, meta, adapter }] of entries) {
    const known = hotRoutes.get(routeId)
    if (known) {
      refreshRoute(routeId, route, meta, adapter, known)
    }
  }
}

/**
 * Updates the live route of `window.__TSR_ROUTER__` from one evaluation of
 * its route module (see `applyRouteHmr`).
 */
function refreshRoute(
  routeId: string,
  route: AnyRoute,
  meta: RouteHmrMeta,
  adapter: RouteHmrAdapter,
  known: { routes: WeakSet<AnyRoute>; meta: RouteHmrMeta },
): void {
  if (process.env.NODE_ENV !== 'production') {
    const router = window.__TSR_ROUTER__
    const current = router?.routesById?.[routeId] as HotRoute | undefined
    // Another router, or a router without this route: leave it alone.
    if (!router || !current) {
      return
    }
    // A router catch boundary holds a render error the framework cannot
    // recover from in place: the global boundary's reset re-renders the
    // document a root route renders (Solid cannot client-render a hydratable
    // `<html>`; React and Vue lose the root after an error during
    // hydration), and Solid's and Vue's route boundaries do not reset when
    // the fixed component swaps in. Reload, as a route edit without route
    // HMR does.
    if (router._hmrReload) {
      window.location.reload()
      return
    }
    // A route tree module that re-executed since the router last read it (a
    // route added or renamed) holds this module's current export where the
    // router still holds an older evaluation: its parent's children no
    // longer include the router's route. Read the tree again first, so the
    // tree's route is the one updated. The root route has no parent, and a
    // read starts from the router's own root, so a root is never re-read.
    const siblings = (current.parentRoute as { children?: unknown } | undefined)
      ?.children
    if (siblings && !Object.values(siblings).includes(current)) {
      setRoutes(router, adapter)
    }
    const live = router.routesById[routeId] as HotRoute | undefined
    if (!live || !known.routes.has(live) || live === route) {
      return
    }
    const next = route as HotRoute

    const liveOptions = live.options
    const nextOptions: HotRoute['options'] = { ...next.options }
    if ('shellComponent' in liveOptions === 'shellComponent' in nextOptions) {
      for (const key of componentKeys) {
        const held = liveOptions[key]
        const value = nextOptions[key]
        if (held === undefined || value === undefined || held === value) {
          continue
        }
        const heldHot: LazyRouteComponentHot | undefined = held.__tsrHot
        const valueHot: LazyRouteComponentHot | undefined = value.__tsrHot
        if (heldHot && valueHot) {
          // Keep the live wrapper; it re-imports and decides keep or swap.
          // Vite bundled dev without lazy compilation (Rolldown) turns a
          // patch's `import()` of a chunk the page never loaded into a lookup
          // that throws `MissingFactoryError`; only the held wrapper's own
          // (first) importer loads that chunk.
          const firstImporter = heldHot.importer
          const importer = valueHot.importer
          const onError = (err: unknown) => {
            if (
              err instanceof Error &&
              err.constructor.name === 'MissingFactoryError'
            ) {
              return firstImporter()
            }
            throw err
          }
          heldHot.update(
            () => {
              try {
                return importer().catch(onError)
              } catch (err) {
                return onError(err)
              }
            },
            valueHot.exportName,
            adapter.keep,
          )
          nextOptions[key] = held
        } else if (
          !held.__tsrHot &&
          !valueHot &&
          adapter.keepUnsplit(
            value,
            held,
            meta.unsplit?.[key] !== undefined &&
              meta.unsplit[key] === known.meta.unsplit?.[key],
          )
        ) {
          nextOptions[key] = held
        }
      }
    }
    for (const key of generatedOptionKeys) {
      if (key in liveOptions) {
        nextOptions[key] = liveOptions[key]
      }
    }

    live.options = nextOptions
    live.update(nextOptions)
    router._replaceRouteChunk?.(live, next.lazyFn)
    setRoutes(router, adapter)

    // routeTree.gen.ts mutates the original export with generated routing
    // state; mirror it so the fresh export keeps working when imported directly.
    next.options = live.options
    next.parentRoute = live.parentRoute
    next._path = live._path
    next._id = live._id
    next._fullPath = live._fullPath
    next._to = live._to

    known.meta = meta
    void router._refreshRoute?.()
  }
}

/**
 * Records one evaluation of a module of a route file that reads a binding
 * the route module keeps (webpack-style hosts): the route module's next
 * evaluation invalidates it (`applyRouteHmr`). The module leaves the record
 * when it is disposed (replaced by an update or invalidated).
 *
 * Not a public API: called by the framework packages' `__tsrKeptReaderHmr`.
 */
export function applyKeptReaderHmr(routeId: string, hot: KeptReaderHot): void {
  if (process.env.NODE_ENV !== 'production') {
    if (isServer ?? typeof window === 'undefined') {
      return
    }
    let readers = keptReaders.get(routeId)
    if (!readers) {
      readers = new Set()
      keptReaders.set(routeId, readers)
    }
    const own = readers
    own.add(hot)
    hot.dispose(() => {
      own.delete(hot)
    })
  }
}

/**
 * Applies one evaluation of a split chunk of a route module (webpack-style
 * hosts). The chunk accepts nothing itself: its update bubbles to its
 * importer. When that is the route module, the route module's evaluation
 * refreshes the route (`applyRouteHmr`), and the chunk evaluating again (the
 * refreshed loader re-imports it) is only recorded. When it is not (Rspack's
 * lazy-compilation proxy re-resolves the chunk alone), the chunk evaluates
 * again before its route module does: then it refreshes the live route, and
 * the route's non-component options reload through their lazy wrappers.
 *
 * Not a public API: called by the framework packages' `__tsrRouteChunkHmr`.
 */
export function applyRouteChunkHmr(routeId: string, chunk: string): void {
  if (process.env.NODE_ENV !== 'production') {
    if (isServer ?? typeof window === 'undefined') {
      return
    }
    let chunks = hotChunks.get(routeId)
    if (!chunks) {
      chunks = new Set()
      hotChunks.set(routeId, chunks)
    }
    if (!chunks.has(chunk)) {
      chunks.add(chunk)
      return
    }
    const router = window.__TSR_ROUTER__
    if (!router?.routesById?.[routeId]) {
      return
    }
    // See `applyRouteHmr`.
    if (router._hmrReload) {
      window.location.reload()
      return
    }
    void router._refreshRoute?.()
  }
}
