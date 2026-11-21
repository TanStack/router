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
  /**
   * The module holds none of the route's component options (each is split
   * into a lazy chunk, or absent): an update of it holds nothing the
   * framework's refresh patches, so it applies without waiting for the
   * refresh (`RouteHmrAdapter.settled`). The lazy wrappers still wait for
   * it when their chunk evaluated again.
   */
  noComponents?: true
  /**
   * Solid: the module of each component option the route module declares
   * (`<option>:<chunk>`, sorted, comma-separated; an empty chunk: the route
   * module). solid-refresh patches per module, from the first proxy a
   * module registered under a name, and stops patching a module that lost a
   * component (https://github.com/solidjs/solid-refresh/issues/88): a
   * component that moved to another module (a `codeSplitGroupings` edit),
   * or that left a split chunk another component stays in, cannot be
   * updated in place, so the page reloads (`applyRouteHmr`). Another
   * component added or removed changes nothing in place.
   */
  chunks?: string
  /**
   * Solid + Vite: solid-refresh's Vite mode patches a module only in its own
   * accept callback (solid-router's `restoredImportReload`).
   */
  vite?: true
  /** React + Vite: the module id plugin-react uses and the export names it ignores (the route, the anchor, the glue name of every module-level binding, and its own name when the user does not export it and the module has no `export *`). */
  refreshExports?: { id: string; anchor: string; exports: Array<string> }
}

/**
 * What the route HMR runtime asks the framework: whether a held component is
 * kept because the framework's refresh runtime patches it in place (absent:
 * the new one is taken), or when the new one can be taken. Not a public API.
 */
export interface RouteHmrAdapter {
  /**
   * Split component: decided when the chunk re-imported after a route update
   * resolves, from the loaded export (a module the chunk handed over:
   * `keepPatched`).
   */
  keep?: (next: any, held: any) => boolean
  /**
   * `held` and `next` are the same option of two evaluations of one module
   * (a route module, a lazy route file, a split chunk that evaluated on its
   * own), and the framework's refresh patches that module in the same
   * update: whether it renders `next`'s code through `held`.
   */
  keepPatched?: (next: any, held: any) => boolean
  /**
   * Runs `apply` once the framework's refresh runtime processed the modules
   * evaluated so far (absent: at once): a component update applied before
   * would remount what the refresh patches in place.
   */
  settled?: (apply: () => void) => void
  /**
   * Called when a lazy wrapper that holds a component sees its import
   * succeed after its previous one failed (a deleted file its chunk reads,
   * restored), before the wrapper settles as usual. Absent: such a failure
   * is not recorded.
   */
  recovered?: () => void
  /** Forgets what the framework records for a route id the router no longer holds. */
  retire?: (routeId: string) => void
}

/** Runs `apply` when the adapter's refresh settled (`RouteHmrAdapter.settled`). */
function whenSettled(adapter: RouteHmrAdapter, apply: () => void): void {
  if (adapter.settled) {
    adapter.settled(apply)
  } else {
    apply()
  }
}

/**
 * Dev-only hot slot of a lazy route component (`lazyRouteComponent(...).__tsrHot`):
 * what the route HMR runtime reads and changes in its framework's wrapper,
 * with the framework's own fields. The wrapper builds it in its dev-only
 * block, on the client only, without importing this module: production and
 * server code never load the runtime. Not a public API.
 */
export interface LazyRouteComponentHot {
  /** The importer and export name the wrapper was created with. */
  readonly importer: () => Promise<any>
  readonly exportName: string | undefined
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

// Per hot slot, the export its wrapper reads since a route update pointed
// it at another one (`updateLazyRouteComponent`); else the one it was
// created with.
const currentExports = new WeakMap<LazyRouteComponentHot, string>()

// The hot slots whose latest import failed while their wrapper held a
// component, for an adapter with `recovered`.
const failedImports = new WeakSet<LazyRouteComponentHot>()

function currentExportOf(hot: LazyRouteComponentHot): string {
  return currentExports.get(hot) ?? hot.exportName ?? 'default'
}

/**
 * Settles the wrapper of `hot` with the export `name` of what `loading`
 * resolves to (see `updateLazyRouteComponent`).
 */
function settleWith(
  hot: LazyRouteComponentHot,
  loading: Promise<any>,
  name: string,
  adapter: RouteHmrAdapter,
): void {
  const promise: Promise<any> = loading.then(
    (res) => {
      if (hot.pending() !== promise) {
        return hot.pending()
      }
      if (failedImports.delete(hot)) {
        adapter.recovered?.()
      }
      const next = res[name]
      const keep = handedOver.has(res) ? adapter.keepPatched : adapter.keep
      const take = () => {
        if (hot.pending() !== promise) {
          return hot.pending()
        }
        hot.setPending(undefined)
        const held = hot.held()
        // a kept component stays (its refresh runtime patches it); either
        // way a failure the wrapper held is over
        hot.settle(held != null && keep?.(next, held) ? held : next, undefined)
        return hot.held()
      }
      const held = hot.held()
      if (held == null || next === held) {
        // nothing the refresh could patch
        return take()
      }
      return new Promise((resolve) => {
        whenSettled(adapter, () => resolve(take()))
      })
    },
    (err) => {
      if (hot.pending() !== promise) {
        return hot.pending()
      }
      hot.setPending(undefined)
      // A component the wrapper holds keeps rendering, as on main: the
      // bundler's HMR client reports the chunk's failure, and the edit
      // that fixes it patches the component in place. A wrapper holding
      // none (its first load failed) holds the new failure.
      const held = hot.held()
      if (held == null) {
        hot.settle(held, err)
      } else if (adapter.recovered) {
        failedImports.add(hot)
      }
      return undefined
    },
  )
  hot.setPending(promise)
}

/**
 * Points the lazy wrapper of `hot` at a new importer. It re-imports
 * through it when the wrapper has loaded (or is loading), then, once the
 * adapter's refresh settled (`settled`), keeps the held component if
 * `keep(loaded, held)` says so (the framework's refresh runtime patches it
 * in place) or swaps to the loaded one, and re-renders the wrapper either
 * way (a failure it held is over); a failed import leaves a wrapper holding
 * a component as it is. A module its chunk handed over
 * (`applyRouteChunkHmr`) evaluated again on its own: its framework's
 * refresh patched it as it patches a route module, so `keepPatched` decides
 * instead. The newest import is the only one whose completion counts: an
 * older one that completes while a newer one is pending settles with the
 * newer one. A wrapper that never loaded only takes the new importer for
 * its first load.
 *
 * Dev-only, client-only; not a public API.
 */
export function updateLazyRouteComponent(
  hot: LazyRouteComponentHot,
  importer: () => Promise<any>,
  exportName: string | undefined,
  adapter: RouteHmrAdapter,
): void {
  const name = exportName ?? 'default'
  currentExports.set(hot, name)
  if (!hot.retarget(importer, exportName)) {
    return
  }
  settleWith(hot, importer(), name, adapter)
}

/**
 * Settles the lazy wrapper of `hot` as `updateLazyRouteComponent` does,
 * with a module its chunk handed over, keeping the importer; a wrapper that
 * holds nothing, or a module without its export, is left alone.
 *
 * Dev-only, client-only; not a public API.
 */
export function takeLazyRouteComponent(
  hot: LazyRouteComponentHot,
  module: Record<string, any>,
  adapter: RouteHmrAdapter,
): void {
  const name = currentExportOf(hot)
  if (hot.held() == null || !(name in module)) {
    return
  }
  settleWith(hot, Promise.resolve(module), name, adapter)
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

/**
 * Every `Route` a route id evaluated to (a route tree rebuilt after an edit
 * imports the module's current export, so any evaluation can be the
 * router's live route), each with the option keys of its route module (read
 * when it evaluates, before the route tree updates it), and the latest
 * evaluation: the only one that refreshes the live route (an older one's
 * refresh can wait for the framework's refresh past a newer one's).
 */
interface HotRouteRecord {
  routes: WeakMap<AnyRoute, ReadonlyArray<string>>
  latest: AnyRoute
  /** The latest evaluation's `RouteHmrMeta.chunks`. */
  chunks: string | undefined
}

// Per route id. Bounded by the number of routes (`setRoutes` forgets the ids
// a rebuilt tree drops); the evaluations are held weakly.
const hotRoutes = new Map<string, HotRouteRecord>()

// Per route id, the split chunks that evaluated since its route module last
// did (`applyRouteChunkHmr`). Bounded by the number of split chunks.
const hotChunks = new Map<string, Set<string>>()

// The exports of every evaluation a split chunk handed over
// (`applyRouteChunkHmr`): the framework's refresh patched each of them.
const handedOver = new WeakSet<object>()

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
 * later one a rebuilt route tree imported), and do nothing otherwise. An
 * evaluation that moves a component of the previous one to another module
 * reloads the page (`RouteHmrMeta.chunks`, Solid).
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
        adapter,
      )
      return
    }
    // this evaluation owns the refresh: the route's chunks the refresh
    // re-imports evaluate as new (`applyRouteChunkHmr`)
    hotChunks.delete(routeId)
    const own = Object.keys(route.options)
    const known = hotRoutes.get(routeId)
    if (!known) {
      hotRoutes.set(routeId, {
        routes: new WeakMap([[route, own]]),
        latest: route,
        chunks: meta.chunks,
      })
      return
    }
    if (known.chunks !== meta.chunks) {
      if (regrouped(known.chunks, meta.chunks)) {
        window.location.reload()
        return
      }
      known.chunks = meta.chunks
    }
    known.routes.set(route, own)
    known.latest = route
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
    scheduleRefresh(routeId, route, meta, adapter, known)
  }
}

/**
 * Whether `next` puts a component option of `before` in another module, or
 * leaves the split chunk of one it removed holding another
 * (`RouteHmrMeta.chunks`).
 */
function regrouped(before = '', next = ''): boolean {
  const chunkOf = (layout: string) =>
    new Map(
      layout.split(',').map((entry) => entry.split(':') as [string, string]),
    )
  const was = chunkOf(before)
  const is = chunkOf(next)
  const kept = new Set(is.values())
  for (const [key, chunk] of was) {
    // moved, or removed from a split chunk another component stays in
    if (is.has(key) ? is.get(key) !== chunk : chunk !== '' && kept.has(chunk)) {
      return true
    }
  }
  return false
}

/** A lazy route file's `Route` (`createLazyFileRoute(id)(options)`). */
interface LazyRouteEvaluation {
  options: { id: string } & Record<string, any>
}

// Per route id, the last evaluation of its lazy route file. Bounded by the
// number of lazy route files.
const hotLazyRoutes = new Map<string, LazyRouteEvaluation>()

/**
 * Applies one evaluation of a lazy route file to the live route of its id.
 * The route loads its lazy options from this evaluation from now on (the
 * route tree's `import()` of the file keeps answering the module it first
 * loaded); a route that loaded the earlier evaluation's options takes the
 * new ones in place once the adapter's refresh settled, when this is still
 * the file's latest evaluation (as for a route module): a component keeps
 * its held value when the framework patches it (`keepPatched`, as for a
 * route module). The first evaluation only records itself. The page
 * reloads, as on every lazy file edit without route HMR, when the live
 * route of `window.__TSR_ROUTER__` (the last router created) doesn't load a
 * lazy file (another router's route of the same id), or when a loaded
 * route's edit removes an option (the route's options are the merge: the
 * route file's value of that option is gone).
 */
function applyLazyRouteHmr(
  routeId: string,
  lazy: LazyRouteEvaluation,
  adapter: RouteHmrAdapter,
): void {
  if (process.env.NODE_ENV !== 'production') {
    const known = hotLazyRoutes.get(routeId)
    hotLazyRoutes.set(routeId, lazy)
    const router = window.__TSR_ROUTER__
    const live = router?.routesById?.[routeId] as HotRoute | undefined
    if (!known) {
      return
    }
    const { id: _id, ...next } = lazy.options
    const state = live?._lazy
    if (
      !router ||
      !live?.lazyFn ||
      router._hmrReload ||
      (state === true &&
        Object.keys(known.options).some((key) => !(key in lazy.options)))
    ) {
      window.location.reload()
      return
    }
    const importer = () => Promise.resolve(lazy as any)
    if (state !== true) {
      router._replaceRouteChunk?.(live, importer)
      // not loaded: its first load takes this evaluation; loading the
      // earlier one, which the router now drops: the refresh loads this one
      if (state !== undefined) {
        void router._refreshRoute?.()
      }
      return
    }
    // the route stays loaded until the latest evaluation commits: a newer
    // one evaluated while this one waits commits instead
    whenSettled(adapter, () => {
      if (hotLazyRoutes.get(routeId) !== lazy) {
        return
      }
      router._replaceRouteChunk?.(live, importer)
      for (const key of componentKeys) {
        const held = live.options[key]
        const value = next[key]
        if (
          held !== undefined &&
          value !== undefined &&
          held !== value &&
          adapter.keepPatched?.(value, held)
        ) {
          next[key] = held
        }
      }
      live.update(next)
      live._lazy = true
      void router._refreshRoute?.()
    })
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
      scheduleRefresh(routeId, route, meta, adapter, known)
    }
  }
}

/**
 * Refreshes the live route from one evaluation of its route module once the
 * adapter's refresh settled (`refreshRoute`), or at once when the module
 * holds no component (`RouteHmrMeta.noComponents`). The live route's lazy
 * wrappers re-import now: a chunk import started after the refresh pass
 * would wait for a pass that isn't coming.
 */
function scheduleRefresh(
  routeId: string,
  route: AnyRoute,
  meta: RouteHmrMeta,
  adapter: RouteHmrAdapter,
  known: HotRouteRecord,
): void {
  const live = window.__TSR_ROUTER__?.routesById?.[routeId] as
    | HotRoute
    | undefined
  const next = route as HotRoute
  if (
    live &&
    known.routes.has(live) &&
    live !== route &&
    sameShape(live.options, next.options)
  ) {
    for (const key of componentKeys) {
      retargetWrapper(live.options[key], next.options[key], adapter)
    }
  }
  if (meta.noComponents) {
    refreshRoute(routeId, route, adapter, known)
    return
  }
  whenSettled(adapter, () => {
    refreshRoute(routeId, route, adapter, known)
  })
}

/** Whether a route's components keep their places (a `shellComponent` added or removed renders another tree). */
function sameShape(live: object, next: object): boolean {
  return 'shellComponent' in live === 'shellComponent' in next
}

// Per lazy wrapper of an evaluation, the live wrapper it retargeted.
const retargeted = new WeakMap<LazyRouteComponentHot, LazyRouteComponentHot>()

/**
 * Keeps the live lazy wrapper `held` of a component option, pointed at the
 * importer of the evaluation's wrapper `value`: it re-imports and decides
 * keep or swap. Whether both are wrappers; once per pair.
 */
function retargetWrapper(
  held: any,
  value: any,
  adapter: RouteHmrAdapter,
): boolean {
  const heldHot: LazyRouteComponentHot | undefined = held?.__tsrHot
  const valueHot: LazyRouteComponentHot | undefined = value?.__tsrHot
  if (!heldHot || !valueHot || held === value) {
    return false
  }
  if (retargeted.get(valueHot) === heldHot) {
    return true
  }
  retargeted.set(valueHot, heldHot)
  // Vite bundled dev without lazy compilation (Rolldown) turns a patch's
  // `import()` of a chunk the page never loaded into a lookup that throws
  // `MissingFactoryError`; only the held wrapper's own (first) importer
  // loads that chunk.
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
  updateLazyRouteComponent(
    heldHot,
    () => {
      try {
        return importer().catch(onError)
      } catch (err) {
        return onError(err)
      }
    },
    valueHot.exportName,
    adapter,
  )
  return true
}

/**
 * Updates the live route of `window.__TSR_ROUTER__` from one evaluation of
 * its route module (see `applyRouteHmr`), when it is still the module's
 * latest.
 */
function refreshRoute(
  routeId: string,
  route: AnyRoute,
  adapter: RouteHmrAdapter,
  known: HotRouteRecord,
): void {
  if (process.env.NODE_ENV !== 'production') {
    // An older evaluation whose refresh waited (for the framework's
    // refresh) past a newer one's: the newer one holds the options.
    if (known.latest !== route) {
      return
    }
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
    const own = live && known.routes.get(live)
    if (!live || !own || live === route) {
      return
    }
    const next = route as HotRoute

    const liveOptions = live.options
    const nextOptions: HotRoute['options'] = { ...next.options }
    if (sameShape(liveOptions, nextOptions)) {
      for (const key of componentKeys) {
        const held = liveOptions[key]
        const value = nextOptions[key]
        if (held == null || value == null || held === value) {
          continue
        }
        if (retargetWrapper(held, value, adapter)) {
          // the live wrapper stays; it re-imports and decides keep or swap
          nextOptions[key] = held
        } else if (
          !held.__tsrHot &&
          !value.__tsrHot &&
          adapter.keepPatched?.(value, held)
        ) {
          nextOptions[key] = held
        }
      }
    }
    // The options the route tree gave the live route (`id`, `path`,
    // `getParentRoute`, a Vue single-file component's `component`) and the
    // ones its lazy route file did stay; an option of the module's own that
    // the edit removed goes.
    for (const key in liveOptions) {
      if (!(key in nextOptions) && !own.includes(key)) {
        nextOptions[key] = liveOptions[key]
      }
    }

    live.options = nextOptions
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

    // the live route's own options are the new evaluation's from now on
    known.routes.set(live, known.routes.get(next)!)
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
 * What a split chunk hands over when it evaluates (Solid): its exports, and
 * whether it holds a non-component option. Not a public API.
 */
export interface RouteChunkHandOver {
  exports: Record<string, any>
  refresh: boolean
  adapter: RouteHmrAdapter
}

/**
 * Applies one evaluation of a split chunk of a route module (webpack-style
 * hosts). When its update bubbles to the route module, the route module's
 * evaluation refreshes the route (`applyRouteHmr`), and the chunk evaluating
 * again (the refreshed loader re-imports it) is only recorded. When it does
 * not (Rspack's lazy-compilation proxy re-resolves a chunk alone; a chunk
 * accepting its own updates, as solid-refresh makes one holding
 * components), the chunk evaluates again before its route module does: then
 * the live route's lazy wrappers take the components it hands over
 * (`handOver`, `takeLazyRouteComponent`), and a chunk holding a
 * non-component option (or handing nothing over) refreshes the live route,
 * whose non-component options reload through their lazy wrappers.
 *
 * Not a public API: called by the framework packages' `__tsrRouteChunkHmr`.
 */
export function applyRouteChunkHmr(
  routeId: string,
  chunk: string,
  handOver?: RouteChunkHandOver,
): void {
  if (process.env.NODE_ENV !== 'production') {
    if (isServer ?? typeof window === 'undefined') {
      return
    }
    if (handOver) {
      handedOver.add(handOver.exports)
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
    const live = router?.routesById?.[routeId] as HotRoute | undefined
    if (!router || !live) {
      return
    }
    // See `applyRouteHmr`.
    if (router._hmrReload) {
      window.location.reload()
      return
    }
    if (handOver) {
      for (const key of componentKeys) {
        const hot: LazyRouteComponentHot | undefined =
          live.options[key]?.__tsrHot
        if (hot) {
          takeLazyRouteComponent(hot, handOver.exports, handOver.adapter)
        }
      }
      if (!handOver.refresh) {
        return
      }
    }
    void router._refreshRoute?.()
  }
}
