import { isServer } from '@tanstack/router-core/isServer'
import type { AnyRoute } from './route'
import type { AnyRouter } from './router'

/**
 * The dev-only route HMR runtime (SPEC J3). Called only by compiler output
 * through the framework packages' `/hmr` entries; not a public API.
 *
 * The model: one record per route file (the route module, or the lazy route
 * file) holds the newest evaluation of that file and what the host reported
 * of its other modules (webpack-style hosts: a split chunk that evaluated on
 * its own, the readers of a kept binding). An evaluation only records itself
 * and schedules the record's commit; the commit is the one place that
 * changes a router, and it reads the record when it runs: whatever
 * evaluated meanwhile is what it applies, and only the newest scheduled
 * commit of a record runs (`turn`).
 *
 * A commit applies to every router on the page that holds a route this file
 * evaluated to (`owners`): never to a route found by its id alone, so
 * neither another router's route of that id nor another file's is touched.
 * The route takes its new options and each owning router loads it again
 * (once): at once, or after the framework's refresh when the route would
 * take a component the refresh may patch in place. A split component
 * follows when its chunk loaded (`load`).
 */

/** Static facts the compiler passes for one evaluation of a route module. */
export interface RouteHmrMeta {
  /** The route file, as the compiler names it: the record's key. */
  file: string
  /** The module is a lazy route file: its `Route` holds the options the route of its id loads with its chunk. */
  lazy?: true
  /**
   * Vite, where the framework patches components in the update's accept
   * callbacks (Solid, Vue): the module's hot context. The commit runs once
   * Vite applied the update (`vite:afterUpdate`), as it runs on a
   * webpack-style host once the update is applied (`HotRecord.applied`).
   */
  hot?: {
    on: (event: string, listener: () => void) => void
    off: (event: string, listener: () => void) => void
  }
  /** Solid (the adapter's `reload`): the module of each component option, `<option>:<chunk>`, sorted, comma-separated. */
  chunks?: string
  /** React + Vite: the export names plugin-react ignores for this module (`file` is the id it asks by). */
  refreshExports?: { anchor: string; exports: Array<string> }
}

/** What the runtime asks the framework. */
export interface RouteHmrAdapter {
  /**
   * `held` and `next` are the same component option before and after an
   * update: whether the framework's refresh renders `next`'s code through
   * `held` (the route keeps `held`). Absent: the route takes `next`.
   */
  keep?: (next: any, held: any) => boolean
  /**
   * Runs `apply` once the framework's refresh processed the modules
   * evaluated so far (absent: at once): a component taken before would
   * remount what the refresh patches in place.
   */
  settled?: (apply: () => void) => void
  /** Whether the step from one evaluation of the route module to the next is one the framework cannot patch in place: the page reloads. */
  reload?: (before: RouteHmrMeta, next: RouteHmrMeta) => boolean
  /** The framework cannot patch a chunk whose import failed and then succeeded: the page reloads. */
  reloadOnRecover?: true
  /** Forgets what the framework keeps for a route file no router holds a route of any more. */
  retire?: (file: string) => void
}

/**
 * Dev-only hot slot of a lazy route component (`lazyRouteComponent(...).__tsrHot`),
 * built by the framework's wrapper on the client.
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
  /** The wrapper's load in flight (what its `preload()` returns), if any; a function of the slot, called unbound. */
  pending: () => Promise<any> | undefined
  setPending: (promise: Promise<any> | undefined) => void
  /** The component the wrapper holds (`undefined` or `null`: none). */
  held: () => any
  /** Holds `component` and `error` (none: `undefined`), and re-renders the wrapper. */
  settle: (component: any, error: unknown) => void
  /** The runtime's: the importer and export the wrapper reads now, the wrapper it was last pointed at, whether its latest import failed. */
  now?: [importer: () => Promise<any>, exportName: string]
  source?: LazyRouteComponentHot
  failed?: true
}

/** What the runtime uses of a webpack-style module's hot handle (`import.meta.webpackHot`). */
export interface KeptReaderHot {
  invalidate: () => void
  dispose: (callback: () => void) => void
  status: () => string
  addStatusHandler: (handler: (status: string) => void) => void
  removeStatusHandler?: (handler: (status: string) => void) => void
}

type HotRoute = AnyRoute & {
  options: Record<string, any>
  parentRoute: AnyRoute
  _path: string
  _id: string
  _fullPath: string
  _to: string
  _lazyRoute?: object
}

/** What a route file evaluates to: a `Route`, or a lazy route (`createLazyFileRoute(id)(options)`). */
interface Evaluation {
  options: Record<string, any>
}

/** One route file. */
interface HotRecord {
  file: string
  /** The id its route has in a router. */
  id: string
  meta: RouteHmrMeta
  /** The newest scheduled commit. */
  turn: number
  /**
   * Every `Route` or lazy route the file evaluated to: a router whose route
   * is one of them (a route module), or loaded one of them (a lazy route
   * file), holds this file's route. For a route module, each with the
   * option keys of the module's own, read when it evaluates, before the
   * route tree updates it.
   */
  evaluations: WeakMap<object, ReadonlyArray<string>>
  /** The newest evaluation. */
  newest?: Evaluation
  /** A lazy route file evaluated since the last commit. */
  dirty?: boolean
  /** Webpack-style hosts: the split chunks that evaluated since the route module last did. */
  chunks: Set<string>
  /** A split chunk evaluated on its own since the last commit: the wrappers import again; `refresh`: it holds a non-component option. */
  again?: boolean
  refresh?: boolean
  /** Webpack-style hosts: the hot handles of the modules reading a binding the route module keeps. */
  readers: Set<KeptReaderHot>
  /** The readers were invalidated in the update being applied: settles when it is applied. */
  applied?: Promise<void>
}

// Per route file; a record goes when no router holds a route of its id any
// more (`setRoutes`).
const records = new Map<string, HotRecord>()

function recordOf(file: string): HotRecord {
  let record = records.get(file)
  if (!record) {
    record = {
      file,
      id: '',
      meta: { file },
      turn: 0,
      evaluations: new WeakMap(),
      chunks: new Set(),
      readers: new Set(),
    }
    records.set(file, record)
  }
  return record
}

/** The routers of the page (each registers itself when created, in development). */
function routers(): Array<AnyRouter> {
  const refs = window.__TSR_ROUTERS__ ?? []
  const live: Array<AnyRouter> = []
  for (let i = refs.length - 1; i >= 0; i--) {
    const router = refs[i]!.deref()
    if (!router) {
      refs.splice(i, 1)
    } else if (router.routesById) {
      // (a router registers in its first update, before it read its route
      // tree: one whose constructor threw never did)
      live.push(router)
    }
  }
  return live
}

/**
 * The routers that hold the record's route, each with that route: the one
 * of the record's id that the route module evaluated to, or that loaded its
 * lazy options from the lazy route file.
 */
function owners(record: HotRecord): Array<[AnyRouter, HotRoute]> {
  const found: Array<[AnyRouter, HotRoute]> = []
  for (const router of routers()) {
    const live = router.routesById[record.id] as HotRoute | undefined
    if (
      live &&
      (record.meta.lazy
        ? // (set once the route merged the lazy route's options; a route
          // module's edit that reset `_lazy` leaves those options in place)
          live._lazyRoute !== undefined &&
          record.evaluations.has(live._lazyRoute)
        : record.evaluations.has(live))
    ) {
      found.push([router, live])
    }
  }
  return found
}

let reloading = false

/**
 * The one way out of an update that cannot apply in place: the document
 * loads again, once.
 */
function reload(): void {
  if (!reloading) {
    reloading = true
    window.location.reload()
  }
}

/**
 * Has the router read its route tree again, then forgets the files of the
 * route ids it held before that no router holds any more (a route removed
 * or renamed).
 */
function setRoutes(router: AnyRouter, adapter: RouteHmrAdapter): void {
  const before = router.routesById as Record<string, AnyRoute>
  router.setRoutes(router.buildRouteTree())
  let others: Array<AnyRouter> | undefined
  for (const routeId in before) {
    if (
      !(routeId in router.routesById) &&
      !(others ??= routers()).some((other) => routeId in other.routesById)
    ) {
      for (const [file, record] of records) {
        if (record.id === routeId) {
          records.delete(file)
          adapter.retire?.(file)
        }
      }
    }
  }
}

const componentKeys = [
  'component',
  'shellComponent',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
]

/** Whether a route's components keep their places (a `shellComponent` added or removed renders another tree). */
function sameShape(live: object, next: object): boolean {
  return 'shellComponent' in live === 'shellComponent' in next
}

/**
 * Imports through the wrapper's importer and settles the wrapper with the
 * export `name`: once the adapter's refresh settled when the component
 * changed, the wrapper keeps the held component if the framework patches it
 * (`keep`) or takes the loaded one. A failed import leaves a wrapper holding
 * a component as it is (the bundler's HMR client reports the failure; the
 * edit that fixes it patches the component in place); a wrapper holding none
 * holds the failure. The newest import is the only one whose completion
 * counts: an older one settles with it (the wrapper's own `load()` follows
 * the same rule).
 *
 * Where the framework has no refresh to wait for, the route's load waits for
 * this import as it waits for a wrapper's first load (`preload`): the
 * component that renders the route's new data is the one that reads it. A
 * wrapper that has not loaded keeps its own `preload`, which answers this
 * import too (it reads the same pending load) and imports again once it
 * failed; the runtime gives one only to a wrapper that has loaded, until the
 * import settles.
 */
function load(
  wrapper: any,
  loading: Promise<any>,
  name: string,
  record: HotRecord,
  adapter: RouteHmrAdapter,
): void {
  const hot: LazyRouteComponentHot = wrapper.__tsrHot
  // (the slot's own function: the same one for every import of the wrapper,
  // so whichever import settles last removes it)
  const waiting = hot.pending
  const promise: Promise<any> = loading.then(
    (module) => {
      if (hot.pending() !== promise) {
        return hot.pending()
      }
      if (hot.failed) {
        hot.failed = undefined
        if (adapter.reloadOnRecover) {
          reload()
          return undefined
        }
      }
      const next = module[name]
      const take = () => {
        if (hot.pending() !== promise) {
          return hot.pending()
        }
        hot.setPending(undefined)
        wrapper.preload = undefined
        const held = hot.held()
        const taken = held != null && adapter.keep?.(next, held) ? held : next
        hot.settle(taken, undefined)
        if (held != null && next !== held) {
          arrived(record, adapter)
        }
        return taken
      }
      const held = hot.held()
      if (held == null || next === held || !adapter.settled) {
        return take()
      }
      return new Promise((resolve) => {
        adapter.settled!(() => resolve(take()))
      })
    },
    (error) => {
      if (hot.pending() !== promise) {
        return hot.pending()
      }
      hot.setPending(undefined)
      if (wrapper.preload === waiting) {
        wrapper.preload = undefined
      }
      const held = hot.held()
      if (held == null) {
        hot.settle(held, error)
      } else {
        hot.failed = true
      }
      return undefined
    },
  )
  hot.setPending(promise)
  if (!adapter.settled && !wrapper.preload) {
    wrapper.preload = waiting
  }
}

/**
 * A wrapper of the record's route holds new code (another component, or
 * the one it held, patched by the framework), maybe after the route loaded
 * again: a catch boundary may hold what the previous code threw, on its
 * own or rendering the route's new data. A boundary resets when its match
 * changes, so each owning router's matches are published again, as they
 * are.
 */
function arrived(record: HotRecord, adapter: RouteHmrAdapter): void {
  for (const [router] of owners(record)) {
    if (!lost(router, adapter)) {
      router.stores.setMatches(
        router.stores.matches.get().map((match) => ({ ...match })),
      )
    }
  }
}

/**
 * Whether a router's catch boundary replaced the document it renders: its
 * global boundary (or a Solid root route's without a shell) caught a render
 * error (`router._hmrReload`) and the router hydrated (`router.ssr`), so the
 * framework cannot render the document again in place. A client-only root's
 * boundaries reset when the route loads again: its mark counts for nothing.
 */
function marked(router: AnyRouter): boolean {
  return !!router._hmrReload && !!router.ssr
}

/**
 * Whether the router's document is lost (`marked`; nothing is published to
 * such a router). Marked before an update, the update reloads the page when
 * it begins (`evaluated`). Marked during one, the page reloads once the
 * framework's refresh pass is through (`settled`): what threw is a
 * component of one version rendering the data of the other, and the
 * reloaded page has both of one version. A framework without such a pass
 * patches as the update applies, where the error may as well be the new
 * code's own: the boundary keeps showing it, and the next update reloads.
 */
function lost(router: AnyRouter, adapter: RouteHmrAdapter): boolean {
  const isLost = marked(router)
  if (isLost && adapter.settled) {
    reload()
  }
  return isLost
}

/**
 * Keeps the live lazy wrapper `held` of a component option, pointed at the
 * importer of the evaluation's wrapper `value` (once per pair): a wrapper
 * that has loaded imports again. Whether both are wrappers.
 */
function point(
  held: any,
  value: any,
  record: HotRecord,
  adapter: RouteHmrAdapter,
): boolean {
  const heldHot: LazyRouteComponentHot | undefined = held?.__tsrHot
  const valueHot: LazyRouteComponentHot | undefined = value?.__tsrHot
  if (!heldHot || !valueHot || held === value) {
    return false
  }
  if (heldHot.source !== valueHot) {
    heldHot.source = valueHot
    // Vite bundled dev without lazy compilation (Rolldown) turns a patch's
    // `import()` of a chunk the page never loaded into a lookup that throws
    // `MissingFactoryError`; only the held wrapper's own (first) importer
    // loads that chunk.
    const first = heldHot.importer
    const onError = (error: unknown) => {
      if (
        error instanceof Error &&
        error.constructor.name === 'MissingFactoryError'
      ) {
        return first()
      }
      throw error
    }
    const importer = () => {
      try {
        return valueHot.importer().catch(onError)
      } catch (error) {
        return onError(error)
      }
    }
    const name = valueHot.exportName ?? 'default'
    heldHot.now = [importer, name]
    if (heldHot.retarget(importer, valueHot.exportName)) {
      load(held, importer(), name, record, adapter)
    }
  }
  return true
}

/** Whether a route that holds `held` would take `value` in its place, a component the framework's refresh may patch. */
function takes(held: any, value: any, adapter: RouteHmrAdapter): boolean {
  return (
    held != null &&
    value != null &&
    held !== value &&
    !held.__tsrHot &&
    !value.__tsrHot &&
    !adapter.keep?.(value, held)
  )
}

/**
 * Schedules the record's commit: now, or after the framework's refresh when
 * an owning route would take a component the refresh may patch in place (a
 * component the route module or the lazy route file itself declares). The
 * routes' lazy wrappers import again now: an import started after the
 * refresh would wait for a pass that isn't coming. Only the newest
 * scheduled commit of a record runs.
 */
function schedule(record: HotRecord, adapter: RouteHmrAdapter): void {
  const turn = ++record.turn
  const next = record.newest!
  const again = record.again
  record.again = false
  let settle = false
  for (const [, live] of owners(record)) {
    const paired =
      record.meta.lazy ||
      (live !== next &&
        live.options !== next.options &&
        sameShape(live.options, next.options))
    for (const key of componentKeys) {
      const held = live.options[key]
      const value = paired ? next.options[key] : undefined
      if (!record.meta.lazy && point(held, value, record, adapter)) {
        continue
      }
      settle ||= takes(held, value, adapter)
      if (again && held?.__tsrHot?.held() != null) {
        // a chunk evaluated on its own: what the wrapper imports may be new
        const hot: LazyRouteComponentHot = held.__tsrHot
        const [importer, name] = hot.now ?? [
          hot.importer,
          hot.exportName ?? 'default',
        ]
        load(held, importer(), name, record, adapter)
      }
    }
  }
  const run = () => {
    if (record.turn === turn) {
      commit(record, adapter)
    }
  }
  if (settle && adapter.settled) {
    adapter.settled(run)
  } else {
    run()
  }
}

/**
 * Applies the record to every router that holds its route, then has each
 * load the route again, once. A route two routers share takes the update
 * once; each of the routers loads. A router whose document is lost is left
 * as it is (`lost`).
 */
function commit(record: HotRecord, adapter: RouteHmrAdapter): void {
  const { dirty, refresh } = record
  record.dirty = record.refresh = false
  const updated = new Set<AnyRoute>()
  for (const [router, live] of owners(record)) {
    if (lost(router, adapter)) {
      continue
    }
    let changed = !!refresh
    if (record.meta.lazy) {
      if (dirty) {
        applyLazy(live, record.newest!.options, adapter)
        changed = true
      }
    } else if (updated.has(live)) {
      // another router updated the route they share
      setRoutes(router, adapter)
      changed = true
    } else {
      const route = applyRoute(router, live, record, adapter)
      if (route) {
        updated.add(route)
        changed = true
      }
    }
    if (changed) {
      void router._refreshRoute?.()
    }
  }
}

/** Updates a router's route from the newest evaluation of its route module: the route it updated, if any. */
function applyRoute(
  router: AnyRouter,
  current: HotRoute,
  record: HotRecord,
  adapter: RouteHmrAdapter,
): HotRoute | undefined {
  const next = record.newest as HotRoute
  // A route tree module that re-executed since the router last read it (a
  // route added or renamed) holds this module's current export where the
  // router still holds an older evaluation: its parent's children no longer
  // include the router's route. Read the tree again first, so the tree's
  // route is the one updated.
  const siblings = (current.parentRoute as { children?: unknown } | undefined)
    ?.children
  if (siblings && !Object.values(siblings).includes(current)) {
    setRoutes(router, adapter)
  }
  const live = router.routesById[record.id] as HotRoute | undefined
  const own = live && record.evaluations.get(live)
  if (!live || !own || live === next || live.options === next.options) {
    return undefined
  }
  const liveOptions = live.options
  const nextOptions: HotRoute['options'] = { ...next.options }
  if (sameShape(liveOptions, nextOptions)) {
    for (const key of componentKeys) {
      const held = liveOptions[key]
      const value = nextOptions[key]
      if (held == null || value == null || held === value) {
        continue
      }
      if (
        // the live wrapper stays: it imports again and keeps or takes
        point(held, value, record, adapter) ||
        (!held.__tsrHot && !value.__tsrHot && adapter.keep?.(value, held))
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
  record.evaluations.set(live, record.evaluations.get(next)!)
  return live
}

/** Gives a route that loaded its lazy route file the file's newest options. */
function applyLazy(
  live: HotRoute,
  lazy: Record<string, any>,
  adapter: RouteHmrAdapter,
): void {
  const { id: _id, ...next } = lazy
  for (const key of componentKeys) {
    const held = live.options[key]
    const value = next[key]
    if (
      held != null &&
      value != null &&
      held !== value &&
      adapter.keep?.(value, held)
    ) {
      next[key] = held
    }
  }
  Object.assign(live.options, next)
}

/**
 * Schedules the record's commit: once the host applied the update being
 * applied, where what the commit loads or renders is not there before (a
 * webpack-style host that invalidated the record's readers; Vite, for a
 * framework that patches in the update's accept callbacks), else now.
 */
function evaluated(record: HotRecord, adapter: RouteHmrAdapter): void {
  // A router whose catch boundary holds a render error the framework cannot
  // recover from in place reloads the page (as a route edit without route
  // HMR does): this update is the first after the error.
  if (owners(record).some(([router]) => marked(router))) {
    reload()
    return
  }
  const go = () => schedule(record, adapter)
  const hot = record.meta.hot
  if (record.applied) {
    void record.applied.then(go)
  } else if (hot) {
    const applied = () => {
      hot.off('vite:afterUpdate', applied)
      go()
    }
    hot.on('vite:afterUpdate', applied)
  } else {
    go()
  }
}

/**
 * One evaluation of a route module or lazy route file (`meta.lazy`). The
 * first one only records itself.
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
    const record = recordOf(meta.file)
    const before = record.newest && record.meta
    const previous = record.newest
    const evaluation = route as unknown as Evaluation
    record.id = routeId
    record.meta = meta
    record.newest = evaluation
    if (meta.lazy) {
      record.evaluations.set(route, [])
      if (!previous) {
        return
      }
      const removed = Object.keys(previous.options).some(
        (key) => !(key in evaluation.options),
      )
      // Every evaluation answers the newest options: the route tree's
      // `import()` of the file keeps answering the module it first loaded,
      // so a route that loads its lazy options later loads these.
      for (const key in previous.options) {
        delete previous.options[key]
      }
      evaluation.options = Object.assign(previous.options, evaluation.options)
      // A loaded route's options are the merge of its route module's and
      // these: the route module's value of an option this edit removed is
      // gone. Reload, as every lazy file edit without route HMR does.
      if (removed && owners(record).length > 0) {
        reload()
        return
      }
      record.dirty = true
      evaluated(record, adapter)
      return
    }
    // the chunks this evaluation's refresh imports evaluate as its own
    record.chunks.clear()
    record.evaluations.set(route, Object.keys(route.options))
    if (!before) {
      return
    }
    if (adapter.reload?.(before, meta) && owners(record).length > 0) {
      reload()
      return
    }
    // Webpack-style hosts: the modules reading what this module kept read
    // its earlier evaluation. Invalidated while the update applies, they
    // leave the module cache in the same update (which may evaluate this
    // module again), and the commit, once the update is applied, imports
    // them again.
    const hot: KeptReaderHot | undefined = record.readers.values().next().value
    if (hot && !record.applied && hot.status() === 'apply') {
      for (const reader of record.readers) {
        reader.invalidate()
      }
      record.applied = new Promise((resolve) => {
        const handler = (status: string) => {
          if (status === 'idle' || status === 'fail' || status === 'abort') {
            hot.removeStatusHandler?.(handler)
            record.applied = undefined
            if (status === 'idle') {
              resolve()
            }
          }
        }
        hot.addStatusHandler(handler)
      })
    }
    evaluated(record, adapter)
  }
}

/**
 * Webpack-style hosts: one evaluation of a module of the route file `file`
 * that reads a binding the route module keeps. The route module's next
 * evaluation invalidates it (`applyRouteHmr`); it leaves the record when it
 * is disposed.
 *
 * Not a public API: called by the framework packages' `__tsrKeptReaderHmr`.
 */
export function applyKeptReaderHmr(file: string, hot: KeptReaderHot): void {
  if (process.env.NODE_ENV !== 'production') {
    if (isServer ?? typeof window === 'undefined') {
      return
    }
    const { readers } = recordOf(file)
    readers.add(hot)
    hot.dispose(() => {
      readers.delete(hot)
    })
  }
}

/**
 * Webpack-style hosts: one evaluation of a split chunk of the route file
 * `file`. Its first one since the route module evaluated is that
 * evaluation's own (its refresh imported the chunk). A later one is the
 * chunk evaluating on its own (Rspack's lazy-compilation proxy re-resolves a
 * chunk alone; a chunk accepts its own updates, as solid-refresh makes one
 * holding components): the route's lazy wrappers import again, and the
 * route loads again when the chunk holds a non-component option
 * (`refresh`).
 *
 * Not a public API: called by the framework packages' `__tsrRouteChunkHmr`.
 */
export function applyRouteChunkHmr(
  file: string,
  chunk: string,
  adapter: RouteHmrAdapter,
  refresh = true,
): void {
  if (process.env.NODE_ENV !== 'production') {
    if (isServer ?? typeof window === 'undefined') {
      return
    }
    const record = recordOf(file)
    if (!record.chunks.has(chunk)) {
      record.chunks.add(chunk)
      return
    }
    if (!record.newest) {
      return
    }
    record.again = true
    record.refresh ||= refresh
    evaluated(record, adapter)
  }
}
