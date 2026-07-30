// Keep this filename free of a secondary extension so declaration generation
// can rewrite relative imports for both ESM and CJS.
import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import { getLocationChangeInfo, runRouteLifecycle } from './router'
import { hydrateSsrMatchId } from './ssr/ssr-match-id'
import type { GLOBAL_SEROVAL, GLOBAL_TSR } from './ssr/constants'
import type { AnySerializationAdapter } from './ssr/serializer/transformer'
import type { TsrSsrGlobal } from './ssr/types'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './Matches'
import type { NotFoundError } from './not-found'
import type {
  AnyRoute,
  BeforeLoadContextOptions,
  LoaderFnContext,
  RouteContextOptions,
  RouteLoaderFn,
} from './route'
import type { AnyRedirect } from './redirect'
import type { AnyRouter } from './router'

export function replaceRouteChunk(
  route: AnyRoute,
  lazyFn: AnyRoute['lazyFn'],
): void {
  route.lazyFn = lazyFn ?? route.lazyFn
  route._lazy = undefined
}

export function loadRouteChunk(
  route: AnyRoute,
  // `false` waits only for lazy route options, before a boundary is selected.
  componentType?: 'errorComponent' | 'notFoundComponent' | false,
  onPendingReady?: () => void,
): Promise<void> | undefined {
  const afterLazy = () => {
    if (componentType === false) {
      return
    }
    if (componentType) {
      return (route.options[componentType] as any)?.preload?.()
    }
    const component = (route.options.component as any)?.preload?.()
    const pending = (route.options.pendingComponent as any)?.preload?.()
    if (onPendingReady) {
      pending ? pending.then(onPendingReady, () => {}) : onPendingReady()
    }
    if (component && pending) {
      return Promise.all([component, pending]).then(() => {})
    }
    return component ?? pending
  }
  const current = route._lazy
  if (current) {
    return current === true ? afterLazy() : current.then(afterLazy)
  }
  if (!route.lazyFn) {
    return afterLazy()
  }

  const promise = route.lazyFn().then(
    (lazyRoute) => {
      // HMR clears the owner before an obsolete import can settle.
      if (process.env.NODE_ENV === 'production' || route._lazy === promise) {
        const { id: _id, ...options } = lazyRoute.options
        Object.assign(route.options, options)
        route._lazy = true
      }
    },
    (error) => {
      if (process.env.NODE_ENV === 'production' || route._lazy === promise) {
        route._lazy = undefined
      }
      throw error
    },
  )
  route._lazy = promise
  return promise.then(afterLazy)
}

/** Return the structural lane through the first terminal render boundary. */
export function _getRenderedMatches(
  matches: Array<AnyRouteMatch>,
): Array<AnyRouteMatch> {
  const end =
    matches.findIndex(
      (match) => match.status !== 'success' || match._notFound,
    ) + 1
  return end && end < matches.length ? matches.slice(0, end) : matches
}

/** Return the lane whose document assets belong to the current presentation. */
export function _getAssetMatches(
  matches: Array<AnyRouteMatch>,
): Array<AnyRouteMatch> {
  let end = matches.length
  for (let index = 0; index < end; index++) {
    const match = matches[index]!
    // `_assetEnd` is only ever set on hydration presentation clones that are
    // `status: 'pending'`, `ssr: 'data-only'`, error-free, and not not-found
    // (see hydration reconstruction below), and commits clear it — so its
    // presence alone is the guard.
    if (match._assetEnd !== undefined) {
      end = Math.min(end, Math.max(index + 1, match._assetEnd))
      continue
    }
    if (match.status !== 'success' || match._notFound) {
      end = index + 1
      break
    }
  }
  // `end` only ever shrinks to `index + 1 >= 1`, so no zero guard is needed.
  return end < matches.length ? matches.slice(0, end) : matches
}

declare const lanePhase: unique symbol

type LanePhase = 'matched' | 'contextualized' | 'reduced' | 'projected'

/**
 * Lane matches carry their lane's phase so functions can demand evidence of
 * pipeline position (e.g. `commitMatches` only accepts a projected lane's
 * matches). The brand is phantom — it never exists at runtime.
 */
type LaneMatches<TPhase extends LanePhase> = Array<WorkMatch> & {
  readonly [lanePhase]: TPhase
}

type Lane<TPhase extends LanePhase> = [
  location: ParsedLocation,
  matches: LaneMatches<TPhase>,
  background?: Array<BackgroundLoaderTask>,
  backgroundSettlement?: Promise<IndexedOutcome | undefined>,
] & { readonly [lanePhase]: TPhase }

type MatchedLane = Lane<'matched'>
type ContextualizedLane = Lane<'contextualized'>
type ReducedLane = Lane<'reduced'>
type ProjectedLane = Lane<'projected'>

const SUCCESS = 0
const ERROR = 1
const NOT_FOUND = 2
// Control outcomes stay contiguous so the hot path can test them together.
const REDIRECTED = 3
const CANCELED = 4

type SharedLoaderFailure =
  | [kind: typeof ERROR, error: unknown]
  | [kind: typeof NOT_FOUND, error: NotFoundError]
  | [kind: typeof REDIRECTED, redirect: AnyRedirect]

type LoaderFailure = SharedLoaderFailure | [kind: typeof CANCELED]

type LoaderOutcome =
  | [kind: typeof SUCCESS, data: unknown, updatedAt?: number]
  | SharedLoaderFailure

type LoaderSuccess = [kind: typeof SUCCESS, data: unknown, updatedAt: number]

type LoaderResult = LoaderSuccess | LoaderFailure
type LoaderFlightResult = LoaderSuccess | SharedLoaderFailure

type IndexedOutcome = [index: number, outcome: LoaderFailure, boundary?: number]

declare const flightGeneration: unique symbol

export type LoaderFlight = [
  outcome: Promise<LoaderFlightResult>,
  controller: AbortController,
  leases: number,
  registry: Map<string, LoaderFlight>,
] & { readonly [flightGeneration]: true }

type WorkMatch = AnyRouteMatch & {
  _flight?: LoaderFlight
  _claimedFlight?: LoaderFlight
}

declare const matchPhase: unique symbol

/** A match whose loader outcome has been applied by `settle`. */
type SettledMatch = WorkMatch & { readonly [matchPhase]: 'settled' }

export type LoadTransaction = [
  controller: AbortController,
  redirects: number,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  startedAt: number,
  done: Promise<void>,
  /**
   * Dev-only HMR refresh mode. Presence is the mode flag; a refresh always
   * carries the presentation it started from, while the hydration handoff is
   * genuinely optional. The rollback exists only while its publication awaits
   * render acknowledgement.
   */
  refresh?: [
    presentation: Array<AnyRouteMatch>,
    handoff: NonNullable<AnyRouter['_handoff']> | undefined,
    rollback?: () => boolean,
  ],
]

export type PendingSession = [
  owner: LoadTransaction,
  boundary: number,
  /** Pending reveal time until acknowledged, then minimum-visible-until time. */
  deadline: number,
  timer?: ReturnType<typeof setTimeout>,
  ack?: Promise<boolean>,
  component?: unknown,
]

type CoordinatorRouter = AnyRouter & {
  _refreshNextLoad?: boolean
}

type LoaderTask = [
  index: number,
  outcome: Promise<LoaderResult>,
  chunkFailure: Promise<IndexedOutcome | undefined>,
  candidate?: WorkMatch,
]

type BackgroundLoaderTask = [
  index: number,
  outcome: Promise<LoaderResult>,
  chunkFailure: Promise<IndexedOutcome | undefined>,
  candidate: WorkMatch,
]

type ExecuteLaneOptions = [
  controller: AbortController,
  redirects: number,
  isCurrent: () => boolean,
  base: Array<AnyRouteMatch>,
  preload: boolean,
  sync?: boolean,
  forceStaleReload?: boolean,
  resolvedPrefix?: number,
  onReady?: () => void,
]

type ControlOutcome =
  | [kind: typeof REDIRECTED, redirect: AnyRedirect]
  | [kind: typeof CANCELED]

type LaneResult = ProjectedLane | ControlOutcome

function isControl(
  result: Lane<any> | ControlOutcome,
): result is ControlOutcome {
  return typeof result[0 /* location or kind */] === 'number'
}

export function waitFor<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.race([Promise.reject(signal), value])
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(value)
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  })
}

function getRoute(router: AnyRouter, match: WorkMatch): AnyRoute {
  return (router.routesById as Record<string, AnyRoute>)[match.routeId]!
}

function normalize(
  value: unknown,
  rejected: true,
  routeId?: string,
): SharedLoaderFailure
function normalize(
  value: unknown,
  rejected: false,
  routeId?: string,
): LoaderOutcome
function normalize(
  value: unknown,
  rejected: boolean,
  routeId?: string,
): LoaderOutcome {
  if (isRedirect(value)) {
    return [REDIRECTED, value]
  }
  if (isNotFound(value)) {
    value.routeId ||= routeId
    return [NOT_FOUND, value]
  }
  if (rejected && typeof (value as any)?.then === 'function') {
    value = new Error('A Promise was thrown', { cause: value })
  }
  return rejected ? [ERROR, value] : [SUCCESS, value]
}

function normalizeError(route: AnyRoute, cause: unknown): SharedLoaderFailure {
  let outcome = normalize(cause, true, route.id)
  if (outcome[0 /* kind */] !== ERROR) {
    return outcome
  }
  try {
    route.options.onError?.(outcome[1 /* error */])
  } catch (onErrorCause) {
    outcome = normalize(onErrorCause, true, route.id)
  }
  return outcome
}

function normalizeLaneError(
  route: AnyRoute,
  cause: unknown,
  options: ExecuteLaneOptions,
): LoaderFailure {
  if (
    options[0 /* controller */].signal.aborted ||
    !options[2 /* isCurrent */]()
  ) {
    options[0 /* controller */].abort()
    return [CANCELED]
  }
  return normalizeError(route, cause)
}

function navigateFrom(router: AnyRouter, location: ParsedLocation) {
  return (opts: any) =>
    router.navigate({
      ...opts,
      _fromLocation: location,
    })
}

async function contextualize(
  router: AnyRouter,
  lane: MatchedLane,
  options: ExecuteLaneOptions,
  end: number,
): Promise<IndexedOutcome | undefined> {
  const [location, matches] = lane
  const signal = options[0 /* controller */].signal
  const preload = options[4 /* preload */]
  for (let index = options[7 /* resolvedPrefix */] ?? 0; index < end; index++) {
    const match = matches[index]!
    const route = getRoute(router, match)

    match.abortController = options[0 /* controller */]
    // Contextualization is serial, so the previous match already contains the
    // complete parent context for this route.
    const parentContext =
      matches[index - 1]?.context ?? router.options.context ?? {}
    const common = {
      params: match.params,
      location,
      navigate: navigateFrom(router, location),
      buildLocation: router.buildLocation,
      cause: preload ? ('preload' as const) : match.cause,
      abortController: options[0 /* controller */],
      preload,
      matches,
      routeId: route.id,
    }
    let context = parentContext
    try {
      let routeContext = match._ctx
      if (!routeContext && route.options.context) {
        routeContext = match._ctx =
          route.options.context({
            ...common,
            deps: match.loaderDeps,
            context: parentContext,
          } satisfies RouteContextOptions<any, any, any, any, any>) || {}
      }
      context = {
        ...parentContext,
        ...routeContext,
      }
      match.context = context
    } catch (cause) {
      releaseFlight(match)
      return [index, normalizeLaneError(route, cause, options)]
    }
    if (signal.aborted || !options[2 /* isCurrent */]()) {
      options[0 /* controller */].abort()
      return [index, [CANCELED]]
    }
    const validationError = match.paramsError ?? match.searchError
    if (validationError !== undefined) {
      releaseFlight(match)
      return [index, normalizeLaneError(route, validationError, options)]
    }
    const beforeLoad = route.options.beforeLoad
    if (!beforeLoad) {
      continue
    }

    const beforeLoadContext: BeforeLoadContextOptions<
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any,
      any
    > = {
      ...common,
      search: match.search,
      context,
      ...router.options.additionalContext,
    }

    const previousStatus = match.status
    if (previousStatus === 'success') {
      match.status = 'pending'
    }
    options[8 /* onReady */]?.()
    try {
      setFetching(router, match, 'beforeLoad', options[0 /* controller */])
      const result = await waitFor(beforeLoad(beforeLoadContext), signal)
      if (!options[2 /* isCurrent */]()) {
        options[0 /* controller */].abort()
        return [index, [CANCELED]]
      }
      const outcome = normalize(result, false, route.id)
      if (outcome[0 /* kind */] !== SUCCESS) {
        releaseFlight(match)
        return [index, outcome]
      }
      match.context = {
        ...context,
        ...result,
      }
    } catch (cause) {
      releaseFlight(match)
      return [index, normalizeLaneError(route, cause, options)]
    } finally {
      if (previousStatus === 'success' && match.status === 'pending') {
        match.status = 'success'
      }
      setFetching(router, match, false, options[0 /* controller */])
    }
  }

  return
}

function detachOwnedFlight(
  matchId: string,
  flight: LoaderFlight | undefined,
): AbortController | undefined {
  if (flight && !--flight[2 /* leases */]) {
    if (flight[3 /* registry */].get(matchId) === flight) {
      flight[3 /* registry */].delete(matchId)
    }
    return flight[1 /* controller */]
  }
  return
}

function detachFlight(match: WorkMatch): AbortController | undefined {
  const flight = match._flight
  match._flight = undefined
  return detachOwnedFlight(match.id, flight)
}

function detachClaim(match: WorkMatch): AbortController | undefined {
  const flight = match._claimedFlight
  match._claimedFlight = undefined
  return detachOwnedFlight(match.id, flight)
}

function releaseFlight(match: WorkMatch): void {
  const claimed = detachClaim(match)
  const accepted = detachFlight(match)
  claimed?.abort()
  accepted?.abort()
}

function retireFlight(matchId: string, flight: LoaderFlight): void {
  if (flight[3 /* registry */].get(matchId) === flight) {
    flight[3 /* registry */].delete(matchId)
  }
}

/** Release every loader-flight lease owned by a discarded match set. */
export function transferMatchResources(previous: Array<AnyRouteMatch>): void {
  const abort: Array<AbortController> = []
  for (const match of previous as Array<WorkMatch>) {
    const claimed = detachClaim(match)
    const accepted = detachFlight(match)
    if (claimed) {
      abort.push(claimed)
    }
    if (accepted) {
      abort.push(accepted)
    }
  }
  for (const controller of abort) {
    controller.abort()
  }
}

function claimPendingFlights(
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
): void {
  for (const match of matches as Array<WorkMatch>) {
    const flight = router._flights.get(match.id)
    if (flight && flight !== match._flight) {
      flight[2 /* leases */]++
      match._claimedFlight = flight
    }
  }
}

function setFetching(
  router: AnyRouter,
  match: WorkMatch,
  value: AnyRouteMatch['isFetching'],
  owner: AbortController,
): void {
  match.isFetching = value
  if (router._tx?.[0 /* controller */] !== owner) {
    return
  }
  const store = router.stores.byRoute.get(match.routeId)
  const presented = store?.get()
  if (presented?.id === match.id) {
    store!.set({ ...presented, isFetching: value })
  }
}

function getLoaderContext(
  router: AnyRouter,
  lane: ContextualizedLane,
  match: WorkMatch,
  route: AnyRoute,
  controller: AbortController,
  parentMatchPromise: Promise<WorkMatch> | undefined,
  preload: boolean,
): LoaderFnContext {
  const location = lane[0 /* location */]
  return {
    params: match.params,
    location,
    navigate: navigateFrom(router, location),
    cause: preload ? ('preload' as const) : match.cause,
    abortController: controller,
    preload,
    deps: match.loaderDeps,
    parentMatchPromise: parentMatchPromise as any,
    context: match.context,
    route,
    ...router.options.additionalContext,
  }
}

async function loadResource(
  router: AnyRouter,
  lane: ContextualizedLane,
  match: WorkMatch,
  route: AnyRoute,
  loader: RouteLoaderFn<any>,
  parentMatchPromise: Promise<WorkMatch> | undefined,
  preload: boolean,
  owner: AbortController,
): Promise<LoaderResult> {
  const signal = owner.signal
  if (signal.aborted) {
    return [CANCELED]
  }

  setFetching(router, match, 'loader', owner)
  const registry = router._flights
  try {
    let flight = match._claimedFlight
    match._claimedFlight = undefined
    if (!flight) {
      flight = registry.get(match.id)
      if (flight) {
        flight[2 /* leases */]++
      }
    }
    if (!flight) {
      const controller = new AbortController()
      const outcome = Promise.resolve()
        .then(() =>
          loader(
            getLoaderContext(
              router,
              lane,
              match,
              route,
              controller,
              parentMatchPromise,
              preload,
            ),
          ),
        )
        .then(
          (value): LoaderFlightResult => {
            const result = normalize(value, false, route.id)
            if (result[0 /* kind */] === SUCCESS) {
              result[2 /* updatedAt */] = Date.now()
            } else {
              retireFlight(match.id, flight!)
            }
            return result as LoaderFlightResult
          },
          (cause) => {
            retireFlight(match.id, flight!)
            return flight![2 /* leases */]
              ? normalizeError(route, cause)
              : normalize(cause, true, route.id)
          },
        )
      flight = [outcome, controller, 1, registry] as LoaderFlight
      registry.set(match.id, flight)
    }
    match._flight = flight
    match.abortController = flight[1 /* controller */]
    try {
      return await waitFor(flight[0 /* outcome */], signal)
    } catch (cause) {
      if (cause !== signal) {
        throw cause
      }
      releaseFlight(match)
      return [CANCELED]
    }
  } finally {
    setFetching(router, match, false, owner)
  }
}

function settle(
  match: WorkMatch,
  result: LoaderResult,
  preload: boolean,
): match is SettledMatch {
  const success = result[0 /* kind */] === SUCCESS
  if (result[0 /* kind */] < REDIRECTED) {
    match.error = undefined
    match.status = 'success'
    match.invalid = !success
    if (success) {
      match.loaderData = result[1 /* data */]
      match.updatedAt = result[2 /* updatedAt */]
      match.preload = preload
    }
  }
  return success
}

function cacheLoaderMatch(
  router: CoordinatorRouter,
  match: SettledMatch,
  planned: AnyRouteMatch | undefined,
): void {
  const current = router._cache.get(match.id) as WorkMatch | undefined
  const flight = match._flight
  if (
    current !== planned ||
    (flight &&
      (flight[3 /* registry */].get(match.id) !== flight ||
        router._committed.some(
          (candidate) => (candidate as WorkMatch)._flight === flight,
        )))
  ) {
    return
  }
  const cached = {
    ...match,
    _notFound: undefined,
    context: {},
  } as WorkMatch
  if (cached._flight) {
    cached._flight[2 /* leases */]++
  }
  router._cache.set(match.id, cached)
  if (current) {
    releaseFlight(current)
  }
}

function getParentSnapshot(match: WorkMatch, outcome: LoaderResult): WorkMatch {
  if (outcome[0 /* kind */] === ERROR || outcome[0 /* kind */] === NOT_FOUND) {
    return {
      ...match,
      status: outcome[0 /* kind */] === ERROR ? 'error' : 'notFound',
      error: outcome[1 /* error */],
      _flight: undefined,
    }
  }
  return match
}

function createLoaderTask(
  router: AnyRouter,
  lane: ContextualizedLane,
  index: number,
  tasks: Array<LoaderTask>,
  semanticParent: Promise<WorkMatch> | undefined,
  options: ExecuteLaneOptions,
): Promise<WorkMatch> {
  const match = lane[1 /* matches */][index]!
  const route = getRoute(router, match)
  const preload = options[4 /* preload */]
  if (preload && route.options.preload === false) {
    match.isFetching = false
    return Promise.resolve(match)
  }
  const plannedCacheMatch = preload ? router._cache.get(match.id) : undefined
  let configured
  let reload = match.status !== 'success'
  let reloadFailure: LoaderFailure | undefined
  if (!reload) {
    try {
      configured = route.options.shouldReload
      if (typeof configured === 'function') {
        configured = configured(
          getLoaderContext(
            router,
            lane,
            match,
            route,
            options[0 /* controller */],
            semanticParent,
            preload,
          ),
        )
      }
      if (!options[2 /* isCurrent */]()) {
        options[0 /* controller */].abort()
        reloadFailure = [CANCELED]
      }
      if (!reloadFailure) {
        const staleAge =
          preload || match.preload
            ? (route.options.preloadStaleTime ??
              router.options.defaultPreloadStaleTime ??
              30_000)
            : (route.options.staleTime ?? router.options.defaultStaleTime ?? 0)
        reload = !!(
          match.invalid ||
          configured ||
          (configured === undefined &&
            Date.now() - match.updatedAt >= staleAge &&
            (options[6 /* forceStaleReload */] ||
              match.cause === 'enter' ||
              options[3 /* base */].some(
                (candidate) =>
                  candidate.routeId === match.routeId &&
                  candidate.id !== match.id,
              )))
        )
      }
    } catch (cause) {
      match.invalid = true
      releaseFlight(match)
      reloadFailure = normalizeLaneError(route, cause, options)
    }
  }
  const routeLoader = route.options.loader
  const loader =
    typeof routeLoader === 'function' ? routeLoader : routeLoader?.handler
  let claimed = match._claimedFlight
  if (claimed) {
    if (configured === undefined && !reloadFailure && loader) {
      reload = true
    } else {
      detachClaim(match)?.abort()
      claimed = undefined
    }
  }
  const background = !!(
    loader &&
    reload &&
    match.status === 'success' &&
    !preload &&
    !options[5 /* sync */] &&
    ((typeof routeLoader === 'function'
      ? undefined
      : routeLoader?.staleReloadMode) ??
      router.options.defaultStaleReloadMode) !== 'blocking'
  )
  const blocking =
    reload && !background && (match.status !== 'success' || !!loader)
  if (!reload) {
    match.isFetching = false
  } else if (!loader) {
    match.invalid = false
    match.updatedAt = Date.now()
  } else if (!claimed) {
    if (configured === undefined) {
      if (match._flight) {
        retireFlight(match.id, match._flight)
      }
    } else {
      router._flights.delete(match.id)
    }
  }
  if (blocking) {
    if (claimed) {
      const accepted = detachFlight(match)
      accepted?.abort()
    } else {
      releaseFlight(match)
    }
    // A successful route without a loader has no blocking work to present. It
    // still gets a task so its chunk and derived assets participate in the
    // lane, but putting it back into pending would hide an already-rendered
    // ancestor while only a descendant is loading.
    if (match.status === 'success') {
      match.status = 'pending'
    }
    options[8 /* onReady */]?.()
  }
  const rawOutcome: Promise<LoaderResult> = reloadFailure
    ? Promise.resolve(reloadFailure)
    : !blocking || !loader
      ? Promise.resolve([SUCCESS, match.loaderData, match.updatedAt])
      : loadResource(
          router,
          lane,
          match,
          route,
          loader,
          semanticParent,
          preload,
          options[0 /* controller */],
        )
  const outcome = rawOutcome.then((result) => {
    if (blocking && settle(match, result, preload)) {
      if (preload && loader) {
        cacheLoaderMatch(router, match, plannedCacheMatch)
      }
      // A route is renderable only after both its data and normal component
      // chunk are ready. Its loader data is already available to descendants.
      match.status = 'pending'
    }
    return result
  })

  const rawChunkFailure = waitFor(
    Promise.resolve().then(() =>
      loadRouteChunk(route, undefined, options[8 /* onReady */]),
    ),
    options[0 /* controller */].signal,
  ).catch(
    (cause): IndexedOutcome => [
      index,
      normalizeLaneError(route, cause, options),
    ],
  ) as Promise<IndexedOutcome | undefined>
  const chunkFailure = rawChunkFailure.then((failure) =>
    outcome.then((result) => {
      if (
        blocking &&
        !failure &&
        result[0 /* kind */] === SUCCESS &&
        match.status === 'pending' &&
        options[2 /* isCurrent */]()
      ) {
        match.status = 'success'
        options[8 /* onReady */]?.()
      }
      return failure
    }),
  )
  tasks.push([index, outcome, chunkFailure])
  if (!background) {
    return outcome.then((result) => getParentSnapshot(match, result))
  }
  const candidate: WorkMatch = {
    ...match,
    status: 'pending',
    preload: false,
    _flight: undefined,
    _claimedFlight: claimed,
  }
  match._claimedFlight = undefined
  match.invalid = false
  match.isFetching = 'loader'
  const backgroundOutcome = loadResource(
    router,
    lane,
    candidate,
    route,
    loader,
    semanticParent,
    false,
    options[0 /* controller */],
  ).then((result) => {
    match.isFetching = false
    if (result[0 /* kind */] === SUCCESS) {
      retireFlight(match.id, candidate._flight!)
    }
    settle(candidate, result, false)
    return result
  })
  ;(lane[2 /* background */] ??= []).push([
    index,
    backgroundOutcome,
    chunkFailure,
    candidate,
  ])
  return backgroundOutcome.then((result) =>
    getParentSnapshot(candidate, result),
  )
}

async function getNotFoundBoundary(
  router: AnyRouter,
  matches: Array<WorkMatch>,
  indexed: IndexedOutcome | undefined,
  signal: AbortSignal,
  fallback = 0,
  preload?: boolean,
): Promise<number> {
  const cause = indexed?.[1 /* outcome */][1 /* error or redirect */] as
    | NotFoundError
    | undefined
  let index = cause?.routeId
    ? matches.findIndex((match) => match.routeId === cause.routeId)
    : (indexed?.[0 /* index */] ?? matches.length - 1)
  if (index < 0) {
    index = 0
  }
  for (let i = index; i >= 0; i--) {
    const route = getRoute(router, matches[i]!)
    if (!preload || route.options.preload !== false) {
      const loading = loadRouteChunk(route, false)
      if (loading) {
        try {
          await waitFor(loading, signal)
        } catch (cause) {
          if (cause === signal) {
            throw cause
          }
        }
      }
    }
    if (route.options.notFoundComponent) {
      return i
    }
  }
  return cause?.routeId ? index : fallback
}

function discardBackground(lane: Lane<any>): void {
  if (lane[2 /* background */]) {
    transferMatchResources(
      lane[2 /* background */].map((task) => task[3 /* candidate */]),
    )
    lane[2 /* background */] = undefined
  }
}

function waitForDescendantRedirects(
  tasks: Array<BackgroundLoaderTask> | undefined,
  boundary: number,
): Promise<unknown> {
  return Promise.all(
    (tasks ?? []).map(
      (task) =>
        task[0 /* index */] > boundary &&
        task[1 /* outcome */].then((outcome) => {
          if (outcome[0 /* kind */] === REDIRECTED) {
            throw [task[0 /* index */], outcome] as IndexedOutcome
          }
        }),
    ),
  )
}

async function settleTasks(
  tasks: Array<LoaderTask>,
  serialFailure?: IndexedOutcome,
  redirectTasks?: Array<BackgroundLoaderTask>,
  gate?: number | Promise<number>,
): Promise<IndexedOutcome | undefined> {
  let loaderFailure: IndexedOutcome | undefined

  try {
    await Promise.all(
      tasks.map((task) =>
        task[1 /* outcome */].then(async (outcome) => {
          const taskIndex = task[0 /* index */]
          if (gate && taskIndex >= (await gate)) {
            return
          }
          if (outcome[0 /* kind */] >= REDIRECTED) {
            throw [taskIndex, outcome] as IndexedOutcome
          }
          if (outcome[0 /* kind */] !== SUCCESS) {
            loaderFailure ||= [taskIndex, outcome]
            // Every started descendant must settle before an ordinary failure
            // wins because a redirect from any of them remains control flow.
            await waitForDescendantRedirects(redirectTasks, taskIndex)
          }
        }),
      ),
    )
  } catch (cause) {
    return cause as IndexedOutcome
  }
  return serialFailure ?? loaderFailure
}

async function reduceLane(
  router: AnyRouter,
  lane: ContextualizedLane,
  tasks: Array<LoaderTask>,
  controller: AbortController,
  redirects: number,
  settlement: Promise<IndexedOutcome | undefined>,
  onReady?: () => void,
  preload?: boolean,
): Promise<ReducedLane | ControlOutcome> {
  const matches = lane[1 /* matches */]
  let failure = await settlement
  let redirectLimitExceeded = false
  const plannedBoundary = matches.findIndex((match) => match._notFound)
  const boundaryOf = (found: IndexedOutcome) =>
    found[1 /* outcome */][0 /* kind */] === NOT_FOUND
      ? getNotFoundBoundary(
          router,
          matches,
          found,
          controller.signal,
          0,
          preload,
        )
      : found[0 /* index */]
  let readinessEnd = plannedBoundary < 0 ? matches.length : plannedBoundary

  if ((failure?.[1 /* outcome */][0 /* kind */] ?? 0) >= REDIRECTED) {
    readinessEnd = 0
  } else if (failure) {
    readinessEnd = failure[2 /* boundary */] ??= await boundaryOf(failure)
    for (const task of tasks) {
      if (task[0 /* index */] >= readinessEnd) {
        break
      }
      const outcome = await task[1 /* outcome */]
      // Presence means a loader previously succeeded, even with `undefined`.
      if (
        outcome[0 /* kind */] !== SUCCESS &&
        outcome[0 /* kind */] < REDIRECTED &&
        !('loaderData' in matches[task[0 /* index */]]!)
      ) {
        failure = [task[0 /* index */], outcome]
        readinessEnd = failure[2 /* boundary */] = await boundaryOf(failure)
        break
      }
    }
  }

  for (const task of tasks) {
    if (task[0 /* index */] >= readinessEnd) {
      break
    }
    const chunkFailure = await task[2 /* chunkFailure */]
    if (!chunkFailure) {
      continue
    }
    failure = chunkFailure
    break
  }

  if (failure && failure[1 /* outcome */][0 /* kind */] < REDIRECTED) {
    try {
      await waitForDescendantRedirects(
        lane[2 /* background */],
        (failure[2 /* boundary */] ??= await boundaryOf(failure)),
      )
    } catch (cause) {
      failure = cause as IndexedOutcome
    }
  }

  if ((failure?.[1 /* outcome */][0 /* kind */] ?? 0) >= REDIRECTED) {
    const outcome = failure![1 /* outcome */]
    if (
      outcome[0 /* kind */] !== REDIRECTED ||
      outcome[1 /* redirect */].options.reloadDocument ||
      redirects < 20
    ) {
      discardBackground(lane)
      return outcome as ControlOutcome
    }
    redirectLimitExceeded = true
    failure = [0, [ERROR, new Error('Too many redirects')]]
  }

  const boundary = failure
    ? (failure[2 /* boundary */] ?? (await boundaryOf(failure)))
    : plannedBoundary
  if (boundary >= 0) {
    const outcome = failure?.[1 /* outcome */]
    const kind = outcome?.[0 /* kind */]
    const match = matches[boundary]!
    const cause = outcome?.[1 /* error or redirect */]
    const route = getRoute(router, match)
    if (outcome) {
      match._notFound = undefined
      if (kind === ERROR) {
        match.status = 'error'
      } else {
        ;(cause as NotFoundError).routeId = match.routeId
        if (match.routeId === router.routeTree.id) {
          match.status = 'success'
          match._notFound = true
        } else {
          match.status = 'notFound'
        }
      }
      match.error = cause
      match.isFetching = false
    }
    if (!preload || route.options.preload !== false) {
      try {
        await waitFor<unknown>(
          outcome
            ? Promise.resolve().then(() =>
                loadRouteChunk(
                  route,
                  kind === ERROR ? 'errorComponent' : 'notFoundComponent',
                ),
              )
            : Promise.all([
                loadRouteChunk(route),
                loadRouteChunk(route, 'notFoundComponent'),
              ]),
          controller.signal,
        )
      } catch (cause) {
        if (cause === controller.signal) {
          discardBackground(lane)
          return [CANCELED]
        }
      }
    }
    if (!outcome) {
      match.status = 'success'
      onReady?.()
    } else if (redirectLimitExceeded) {
      controller.abort()
      await Promise.all([
        ...tasks.map((task) => task[1 /* outcome */]),
        ...tasks.map((task) => task[2 /* chunkFailure */]),
        ...(lane[2 /* background */] ?? []).map(
          (task) => task[1 /* outcome */],
        ),
      ])
      discardBackground(lane)
      transferMatchResources(matches)
    }
  }

  return lane as unknown as ReducedLane
}

async function projectLane(
  router: AnyRouter,
  lane: ReducedLane,
  signal: AbortSignal,
  start = 0,
  end = lane[1 /* matches */].length,
): Promise<ProjectedLane> {
  const matches = lane[1 /* matches */]
  for (let index = start; index < end; index++) {
    const match = matches[index]!
    const routeOptions = getRoute(router, match).options
    if (routeOptions.head || routeOptions.scripts) {
      try {
        const context = {
          ssr: router.options.ssr,
          matches,
          match,
          params: match.params,
          loaderData: match.loaderData,
        }
        const [head, scripts] = await waitFor(
          Promise.all([
            routeOptions.head?.(context),
            routeOptions.scripts?.(context),
          ]),
          signal,
        )
        match.meta = head?.meta
        match.links = head?.links
        match.headScripts = head?.scripts
        match.styles = head?.styles
        match.scripts = scripts
      } catch (cause) {
        if (cause === signal) {
          break
        }
        console.error(cause)
      }
    }
    if (match.status !== 'success' || match._notFound) {
      break
    }
  }
  return lane as unknown as ProjectedLane
}

async function executeClientLane(
  router: AnyRouter,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  options: ExecuteLaneOptions,
): Promise<LaneResult> {
  const matched = [location, matches as Array<WorkMatch>] as MatchedLane
  let plannedBoundary = matches.findIndex((match) => match._notFound)
  if (router.options.notFoundMode !== 'root' && plannedBoundary >= 0) {
    const boundary = await getNotFoundBoundary(
      router,
      matched[1 /* matches */],
      undefined,
      options[0 /* controller */].signal,
      plannedBoundary,
      options[4 /* preload */],
    )
    if (boundary !== plannedBoundary) {
      matches[plannedBoundary]!._notFound = undefined
      matches[boundary]!._notFound = true
    }
    plannedBoundary = boundary
  }
  let end = plannedBoundary < 0 ? matches.length : plannedBoundary + 1
  // From here on `matched` is contextualized: `contextualize` communicates
  // through mutation plus a failure return, so the phase brand is asserted at
  // the two use sites below rather than granted by a (byte-costing) return.
  const failure = await contextualize(router, matched, options, end)
  if (failure) {
    options[5 /* sync */] = true
  }
  const tasks: Array<LoaderTask> = []
  const start = options[7 /* resolvedPrefix */] ?? 0
  let semanticParent = start
    ? Promise.resolve(matched[1 /* matches */][start - 1]!)
    : undefined
  end = failure?.[0 /* index */] ?? end
  if (failure?.[1 /* outcome */][0 /* kind */] === NOT_FOUND) {
    failure[2 /* boundary */] = await getNotFoundBoundary(
      router,
      matched[1 /* matches */],
      failure,
      options[0 /* controller */].signal,
      0,
      options[4 /* preload */],
    )
    end = Math.min(end, failure[2 /* boundary */] + 1)
  } else if ((failure?.[1 /* outcome */][0 /* kind */] ?? 0) >= REDIRECTED) {
    end = 0
  }
  for (let index = start; index < end; index++) {
    if (options[0 /* controller */].signal.aborted) {
      break
    }
    semanticParent = createLoaderTask(
      router,
      matched as unknown as ContextualizedLane,
      index,
      tasks,
      semanticParent,
      options,
    )
  }
  for (const match of matched[1 /* matches */]) {
    detachClaim(match)?.abort()
  }
  let reduced: ReducedLane | ControlOutcome
  try {
    const reduction = reduceLane(
      router,
      matched as unknown as ContextualizedLane,
      tasks,
      options[0 /* controller */],
      options[1 /* redirects */],
      settleTasks(tasks, failure, matched[2 /* background */]),
      options[8 /* onReady */],
      options[4 /* preload */],
    )
    if (matched[2 /* background */]?.length) {
      matched[3 /* backgroundSettlement */] = settleTasks(
        matched[2 /* background */],
        undefined,
        undefined,
        reduction.then(
          (foreground) =>
            isControl(foreground)
              ? 0
              : _getRenderedMatches(foreground[1 /* matches */]).length,
          () => 0,
        ),
      )
    }
    reduced = await reduction
  } catch (cause) {
    discardBackground(matched)
    throw cause
  }
  if (isControl(reduced)) {
    return reduced
  }
  return projectLane(
    router,
    reduced,
    options[0 /* controller */].signal,
    options[7 /* resolvedPrefix */] === reduced[1 /* matches */].length
      ? options[7 /* resolvedPrefix */]
      : 0,
  )
}

/**
 * Waits for `pendingMs`, then presents the complete lane. Rendering applies the
 * selected boundary cutoff while retaining every match's structural state.
 * A replacement load for the same match keeps the timer; choosing a different
 * match resets it. `pendingMinMs` starts after the fallback renders.
 */
function offerPending(router: CoordinatorRouter, tx: LoadTransaction): void {
  if (router._tx !== tx) {
    return
  }
  let session = router._pending
  let tookOver = false
  const sessionMatchId =
    session?.[0 /* owner */][3 /* matches */][session[1 /* boundary */]]?.id
  if (session?.[0 /* owner */] !== tx) {
    if (
      session &&
      tx[3 /* matches */][session[1 /* boundary */]]?.id === sessionMatchId
    ) {
      session[0 /* owner */] = tx
      tookOver = true
    } else {
      clearTimeout(session?.[3 /* timer */])
      router._pending = session = undefined
    }
  }
  // The first unresolved match chooses the fallback. A visible fallback stays
  // selected after its route resolves, and a route without one blocks children.
  const presented = router.stores.matches.get()
  let boundary = 0
  let delay: number | undefined
  let min = 0
  let component: unknown
  for (; boundary < tx[3 /* matches */].length; boundary++) {
    const match = tx[3 /* matches */][boundary]!
    const success = match.status === 'success'
    const visible =
      success &&
      presented[boundary]?.id === match.id &&
      presented[boundary]?.status === 'pending'
    if (success && !visible) {
      continue
    }
    const route = getRoute(router, match as WorkMatch)
    delay =
      visible || match.invalid
        ? 0
        : (route.options.pendingMs ?? router.options.defaultPendingMs)
    component =
      route.options.pendingComponent ??
      (router.options as any).defaultPendingComponent
    if (!component || typeof delay !== 'number' || delay === Infinity) {
      return
    }
    min = route.options.pendingMinMs ?? router.options.defaultPendingMinMs ?? 0
    break
  }
  if (delay === undefined) {
    return
  }
  const matchId = tx[3 /* matches */][boundary]!.id
  if (
    !session ||
    session[1 /* boundary */] !== boundary ||
    sessionMatchId !== matchId
  ) {
    // Hydration and redirects can preserve pending presentation without a session.
    // Do not delay it again; conservatively start pendingMinMs from now.
    clearTimeout(session?.[3 /* timer */])
    const presentedMatch = presented[boundary]
    const visible =
      presentedMatch?.id === matchId && presentedMatch.status === 'pending'
    router._pending = session = [
      tx,
      boundary,
      visible ? Date.now() + min : tx[4 /* startedAt */] + delay,
      undefined,
      visible ? Promise.resolve(true) : undefined,
      component,
    ]
  }
  if (
    session[4 /* ack */] &&
    !tookOver &&
    session[5 /* component */] === component
  ) {
    return
  }
  session[5 /* component */] = component
  if (!session[4 /* ack */]) {
    clearTimeout(session[3 /* timer */])
    const remaining = session[2 /* deadline */] - Date.now()
    if (remaining > 0) {
      session[3 /* timer */] = setTimeout(() => {
        offerPending(router, tx)
      }, remaining)
      return
    }
    session[2 /* deadline */] = 0
  }
  const offered = tx[3 /* matches */].map((match) => ({
    ...match,
    _flight: undefined,
  }))
  offered[boundary]!.status = 'pending'
  const ack = router
    .startTransition(() => router.stores.setMatches(offered))
    .then((rendered) => {
      if (
        rendered &&
        router._pending === session &&
        session[4 /* ack */] === ack &&
        !session[2 /* deadline */]
      ) {
        session[2 /* deadline */] = Date.now() + min
      }
      return rendered
    })
  session[4 /* ack */] = ack
}

/**
 * Cancels pending UI timing when its load ends. The ownership check prevents
 * an older, superseded load from clearing pending UI that a newer load took over.
 */
function finishPending(router: CoordinatorRouter, tx: LoadTransaction): void {
  const session = router._pending
  if (session?.[0 /* owner */] === tx) {
    clearTimeout(session[3 /* timer */])
    router._pending = undefined
  }
}

function publishMatches(
  router: CoordinatorRouter,
  matches: Array<AnyRouteMatch>,
): void {
  router._committed = matches
  router.stores.setMatches(matches)
}

function discardLane(lane: ProjectedLane): void {
  transferMatchResources(lane[1 /* matches */])
  discardBackground(lane)
}

function commitMatches(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  matches: LaneMatches<'projected'>,
  resolvedPrefix?: number,
): void {
  const previous = router._committed
  const previousCached = router._cache
  for (const match of matches) {
    match.preload = false
    if (resolvedPrefix) {
      match._assetEnd = undefined
    }
  }
  const cut = _getRenderedMatches(matches).length
  const cached = new Map<string, AnyRouteMatch>()
  const discarded: Array<AnyRouteMatch> = []
  const now = Date.now()
  for (const match of [...previous, ...previousCached.values()]) {
    // Rendered-prefix ids and settled successes anywhere in the lane are
    // authoritative: retaining an older same-id generation would shadow them
    // at the next planning pass. Unsettled beyond-boundary matches are not —
    // they must not evict a newer same-id preload.
    if (
      match.status !== 'success' ||
      matches.some(
        (candidate, index) =>
          candidate.id === match.id &&
          (index < cut || candidate.status === 'success'),
      )
    ) {
      discarded.push(match)
      continue
    }
    const work = match as WorkMatch
    const route = getRoute(router, work)
    if (
      !route.options.loader ||
      now - match.updatedAt >=
        (match.preload
          ? (route.options.preloadGcTime ??
            router.options.defaultPreloadGcTime ??
            300_000)
          : (route.options.gcTime ?? router.options.defaultGcTime ?? 300_000))
    ) {
      discarded.push(match)
      continue
    }
    if (previousCached.get(match.id) === match) {
      cached.set(match.id, match)
    } else {
      cached.set(match.id, {
        ...match,
        _flight: undefined,
        isFetching: false,
        context: {},
      } as WorkMatch)
      discarded.push(match)
    }
  }
  // The lane becomes committed before publication can synchronously reenter.
  tx[3 /* matches */] = []
  router._cache = cached
  publishMatches(router, matches)
  transferMatchResources(discarded)
  runRouteLifecycle(router, previous, matches, () => router._tx === tx)
}

async function transitionRefresh(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  matches: LaneMatches<'projected'>,
  changeInfo: ReturnType<typeof getLocationChangeInfo>,
): Promise<boolean | undefined> {
  const refresh = tx[6 /* refresh */]!
  const commitPromise = router._commitPromise
  // Presence means this refresh is published but not yet acknowledged.
  let previousMatches: Array<AnyRouteMatch> | undefined

  const settle = () => {
    const previous = previousMatches
    previousMatches = undefined
    if (previous) {
      transferMatchResources(previous)
    }
  }
  const rollback = () => {
    refresh[2 /* rollback */] = undefined
    const previous = previousMatches
    if (
      previous === undefined ||
      router._tx !== tx ||
      router._committed !== matches
    ) {
      settle()
      return false
    }

    previousMatches = undefined
    router._committed = previous
    router.batch(() => {
      router.stores.status.set('idle')
      router.stores.setMatches(refresh[0 /* presentation */])
    })
    tx[0 /* controller */].abort()
    transferMatchResources(matches)
    if (router._tx === tx && router._commitPromise === commitPromise) {
      commitPromise?.resolve()
      router._commitPromise = undefined
    }
    return true
  }
  const commit = () => {
    finishPending(router, tx)
    refresh[2 /* rollback */] = rollback
    tx[3 /* matches */] = []
    const previous = router._committed
    previousMatches = previous
    publishMatches(router, matches)
    if (previousMatches === undefined || router._tx !== tx) {
      return
    }
    runRouteLifecycle(router, previous, matches, () => router._tx === tx, true)
    if (previousMatches === undefined || router._tx !== tx) {
      return
    }
    router.emit({ type: 'onLoad', ...changeInfo })
    if (router._tx === tx) {
      router.emit({ type: 'onBeforeRouteMount', ...changeInfo })
    }
  }
  try {
    const rendered = await router.startTransition(commit)
    refresh[2 /* rollback */] = undefined
    if (previousMatches !== undefined) {
      const handoff = refresh[1 /* handoff */]
      if (handoff && router._handoff === handoff) {
        handoff[1 /* finish */]()
      }
      if (router._tx === tx) {
        tx[6 /* refresh */] = undefined
      }
    }
    settle()
    return rendered
  } catch (cause) {
    if (rollback()) {
      return
    }
    throw cause
  }
}

async function awaitCurrent(
  router: CoordinatorRouter,
  owner?: LoadTransaction,
): Promise<void> {
  let current = router._tx
  while (current && current !== owner) {
    await current[5 /* done */]
    if (router._tx === current) {
      return
    }
    current = router._tx
  }
}

async function followRedirect(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  redirect: AnyRedirect,
): Promise<void> {
  await router.navigate({
    ...redirect.options,
    replace: true,
    ignoreBlocker: true,
    _redirects: tx[1 /* redirects */] + 1,
  } as any)
}

function restoreCommitted(
  router: CoordinatorRouter,
  tx: LoadTransaction,
): void {
  finishPending(router, tx)
  tx[0 /* controller */].abort()
  transferMatchResources(tx[3 /* matches */])
  tx[3 /* matches */] = []
  if (router._tx !== tx) {
    return
  }
  router.batch(() => {
    router.stores.status.set('idle')
    router.stores.setMatches(router._committed)
  })
  if (router._tx === tx) {
    router._commitPromise?.resolve()
    router._commitPromise = undefined
  }
}

async function runBackground(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  base: Array<AnyRouteMatch>,
  tasks: Array<BackgroundLoaderTask>,
  settlement: Promise<IndexedOutcome | undefined>,
): Promise<void> {
  // Tasks are appended in route order, so candidates can transfer ownership
  // while untouched matches are cloned in the same pass.
  let taskIndex = 0
  const next = base.map((match, index) => {
    const task = tasks[taskIndex]
    if (task?.[0 /* index */] === index) {
      taskIndex++
      return task[3 /* candidate */]
    }
    const clone = { ...match } as WorkMatch
    if (clone._flight) {
      clone._flight[2 /* leases */]++
    }
    return clone
  })
  // Phase jump: the clones inherit beforeLoad context from the committed
  // foreground lane, which already ran `contextualize` for these matches.
  const lane = [tx[2 /* location */], next] as ContextualizedLane
  let reduced: ReducedLane | ControlOutcome
  try {
    reduced = await reduceLane(
      router,
      lane,
      tasks,
      tx[0 /* controller */],
      tx[1 /* redirects */],
      settlement,
    )
  } catch (cause) {
    transferMatchResources(next)
    throw cause
  }
  if (isControl(reduced)) {
    transferMatchResources(next)
    if (
      reduced[0 /* kind */] === REDIRECTED &&
      router._tx === tx &&
      router._committed === base
    ) {
      await followRedirect(router, tx, reduced[1 /* redirect */])
    }
    return
  }
  const projected = await projectLane(
    router,
    reduced,
    tx[0 /* controller */].signal,
  )
  if (router._tx !== tx || router._committed !== base) {
    transferMatchResources(projected[1 /* matches */])
    return
  }
  for (const task of tasks) {
    const match = task[3 /* candidate */]
    const cached = router._cache.get(match.id) as WorkMatch | undefined
    if (cached?._flight && cached._flight === match._flight) {
      router._cache.delete(match.id)
      releaseFlight(cached)
    }
  }
  publishMatches(router, projected[1 /* matches */])
  transferMatchResources(base)
}

async function runClientTransaction(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  forceStaleReload: boolean,
  onReady?: () => void,
  sync?: boolean,
  resolvedPrefix?: number,
): Promise<void> {
  const options: ExecuteLaneOptions = [
    tx[0 /* controller */],
    tx[1 /* redirects */],
    () => router._tx === tx && !!tx[3 /* matches */].length,
    router._committed,
    false,
    sync,
    forceStaleReload,
    resolvedPrefix,
    onReady,
  ]
  const result = await executeClientLane(
    router,
    tx[2 /* location */],
    tx[3 /* matches */],
    options,
  )

  if (isControl(result)) {
    if (result[0 /* kind */] === REDIRECTED && router._tx === tx) {
      finishPending(router, tx)
      transferMatchResources(tx[3 /* matches */])
      tx[3 /* matches */] = []
      if (router._tx === tx) {
        if (process.env.NODE_ENV !== 'production' && tx[6 /* refresh */]) {
          router._refreshNextLoad = true
        }
        await followRedirect(router, tx, result[1 /* redirect */])
      }
    } else {
      restoreCommitted(router, tx)
    }
    return
  }
  const pending = router._pending
  if (pending?.[0 /* owner */] === tx) {
    /**
     * Loading finished, so cancel any pending reveal. If the fallback rendered,
     * wait out the rest of `pendingMinMs` before replacing it. If it never
     * rendered, there is no minimum wait; if another load took it over, that
     * load owns the deadline.
     */
    clearTimeout(pending[3 /* timer */])
    if (pending[4 /* ack */]) {
      const signal = tx[0 /* controller */].signal
      let rendered = false
      try {
        rendered = await waitFor(pending[4 /* ack */], signal)
      } catch (cause) {
        if (cause !== signal) {
          throw cause
        }
      }
      if (
        rendered &&
        router._pending === pending &&
        pending[0 /* owner */] === tx
      ) {
        const remaining = pending[2 /* deadline */] - Date.now()
        if (remaining > 0) {
          try {
            await waitFor(
              new Promise<void>((resolve) => {
                pending[3 /* timer */] = setTimeout(resolve, remaining)
              }),
              signal,
            )
          } catch {}
          clearTimeout(pending[3 /* timer */])
        }
      }
    }
  }
  if (router._tx !== tx) {
    finishPending(router, tx)
    discardLane(result)
    return
  }
  const toLocation = tx[2 /* location */]
  const changeInfo = getLocationChangeInfo(
    toLocation,
    router.stores.resolvedLocation.get(),
  )
  const background = result[2 /* background */]
  await router.startViewTransition(async () => {
    if (router._tx !== tx) {
      discardLane(result)
      return
    }
    const commit = () => {
      finishPending(router, tx)
      commitMatches(router, tx, result[1 /* matches */], resolvedPrefix)
      if (router._tx !== tx) {
        return
      }
      router.emit({ type: 'onLoad', ...changeInfo })
      if (router._tx === tx) {
        router.emit({ type: 'onBeforeRouteMount', ...changeInfo })
      }
    }
    const rendered =
      process.env.NODE_ENV !== 'production' && tx[6 /* refresh */]
        ? await transitionRefresh(
            router,
            tx,
            result[1 /* matches */],
            changeInfo,
          )
        : await router.startTransition(commit)
    if (
      process.env.NODE_ENV !== 'production' &&
      tx[6 /* refresh */] &&
      rendered === undefined
    ) {
      return
    }
    if (router._tx !== tx) {
      discardBackground(result)
      return
    }
    if (background?.length) {
      // Publish refreshes only after the foreground render acknowledgement.
      // Otherwise a fast refresh can replace the acknowledged generation
      // before the framework commits it and strand the navigation.
      runBackground(
        router,
        tx,
        result[1 /* matches */],
        background,
        result[3 /* backgroundSettlement */]!,
      ).catch(console.error)
    }
    router.batch(() => {
      router.stores.resolvedLocation.set(toLocation)
      router.stores.status.set('idle')
      if (router._tx === tx) {
        router.emit({ type: 'onResolved', ...changeInfo })
      }
      if (rendered && router._tx === tx) {
        router.emit({ type: 'onRendered', ...changeInfo })
      }
    })
    if (router._tx !== tx) {
      return
    }
    router._commitPromise?.resolve()
    router._commitPromise = undefined
  })
}

export async function loadClientRoute(
  router: CoordinatorRouter,
  opts?: { sync?: boolean; _dedupe?: boolean },
): Promise<void> {
  let rematerialize = false
  if (process.env.NODE_ENV !== 'production') {
    router._tx?.[6 /* refresh */]?.[2 /* rollback */]?.()
    rematerialize = !!router._refreshNextLoad || !!router._tx?.[6 /* refresh */]
  }
  const refreshPresentation = rematerialize
    ? router.stores.matches.get()
    : undefined
  const previousOwner = router._tx
  const resolvedLocation = router.stores.resolvedLocation.get()
  const previousLocation = resolvedLocation ?? router.stores.location.get()
  const location = router.latestLocation
  const pendingLocation = router._pendingLocation as
    | (ParsedLocation & { _redirects?: number })
    | undefined
  const redirects =
    pendingLocation?.href === location.href
      ? (pendingLocation._redirects ?? 0)
      : 0
  // A same-location navigation joins the transaction already loading it
  // instead of restarting its work. Reload requests never carry the flag,
  // and same-location redirects must restart the lane they came from.
  if (
    opts?._dedupe &&
    !redirects &&
    previousOwner &&
    !rematerialize &&
    previousOwner[2 /* location */].href === location.href &&
    router.stores.status.get() === 'pending'
  ) {
    await awaitCurrent(router)
    return
  }
  const handoff = router._handoff
  const hydrationController = rematerialize
    ? undefined
    : handoff?.[0 /* claim */]()
  const preflight = new AbortController()
  const previousPreflight = router._preflight
  router._preflight = preflight
  if (!rematerialize && !hydrationController) {
    handoff?.[1 /* finish */]()
  }
  previousPreflight?.abort()
  if (router._preflight !== preflight) {
    await awaitCurrent(router, previousOwner)
    return
  }

  const changeInfo = getLocationChangeInfo(location, resolvedLocation)
  router.emit({ type: 'onBeforeNavigate', ...changeInfo })
  if (router._preflight === preflight) {
    router.emit({ type: 'onBeforeLoad', ...changeInfo })
  }
  if (router._preflight !== preflight) {
    preflight.abort()
    await awaitCurrent(router, previousOwner)
    return
  }
  const sameHref = previousLocation.href === location.href
  let matches: Array<AnyRouteMatch>
  let controller = preflight
  try {
    matches =
      process.env.NODE_ENV !== 'production' && rematerialize
        ? router.matchRoutes(location, {
            _controller: preflight,
            _rematerialize: true,
          })
        : router.matchRoutes(location, { _controller: preflight })
  } catch (cause) {
    preflight.abort()
    if (!isRedirect(cause)) {
      if (process.env.NODE_ENV !== 'production' && rematerialize) {
        router._refreshNextLoad = undefined
      }
      await awaitCurrent(router)
      router._commitPromise?.resolve()
      router._commitPromise = undefined
      return
    }
    await router.navigate({
      ...cause.options,
      replace: true,
      ignoreBlocker: true,
    })
    await awaitCurrent(router, previousOwner)
    return
  }
  const resolvedPrefix = hydrationController
    ? handoff![1 /* finish */](matches)
    : undefined
  if (resolvedPrefix) {
    controller = hydrationController!
  } else {
    hydrationController?.abort()
  }
  if (router._preflight !== preflight) {
    preflight.abort()
    transferMatchResources(matches)
    await awaitCurrent(router, previousOwner)
    return
  }
  router._preflight = undefined
  if (!rematerialize) {
    claimPendingFlights(router, matches)
  }

  const tx: LoadTransaction = [
    controller,
    redirects,
    location,
    matches,
    Date.now(),
    Promise.resolve()
      .then(() =>
        runClientTransaction(
          router,
          tx,
          sameHref,
          () => offerPending(router, tx),
          opts?.sync,
          resolvedPrefix,
        ),
      )
      .catch(() => {
        if (router._tx === tx) {
          restoreCommitted(router, tx)
        }
      }),
  ]
  if (process.env.NODE_ENV !== 'production' && rematerialize) {
    // `refreshPresentation` is always captured when `rematerialize` is set.
    tx[6 /* refresh */] = [refreshPresentation!, handoff]
    router._refreshNextLoad = undefined
  }
  router._tx = tx
  if (!rematerialize && router._handoff === handoff) {
    router._handoff = undefined
  }
  if (previousOwner) {
    for (const match of router.stores.matches.get() as Array<WorkMatch>) {
      if (router._tx !== tx) {
        break
      }
      if (match.isFetching) {
        setFetching(router, match, false, tx[0 /* controller */])
      }
    }
    previousOwner[0 /* controller */].abort()
    transferMatchResources(previousOwner[3 /* matches */])
  }
  if (router._tx !== tx) {
    transferMatchResources(tx[3 /* matches */])
    tx[3 /* matches */] = []
    await awaitCurrent(router, tx)
    return
  }

  router.batch(() => {
    router.stores.status.set('pending')
    router.stores.location.set(location)
  })
  offerPending(router, tx)
  try {
    await tx[5 /* done */]
  } finally {
    await awaitCurrent(router, tx)
  }
}

export async function refreshClientRoute(
  router: CoordinatorRouter,
): Promise<void> {
  router._refreshNextLoad = true
  router._tx?.[6 /* refresh */]?.[2 /* rollback */]?.()
  const pending = router._tx
  if (
    pending &&
    !pending[6 /* refresh */] &&
    router.stores.status.get() === 'pending'
  ) {
    await pending[5 /* done */]
    if (router._tx !== pending) {
      await awaitCurrent(router, pending)
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    router._flights.clear()
  }
  router.clearCache()
  await loadClientRoute(router, { sync: true })
}

export async function preloadClientRoute(
  router: CoordinatorRouter,
  opts: any,
  redirects = 0,
): Promise<Array<AnyRouteMatch> | undefined> {
  if (
    process.env.NODE_ENV !== 'production' &&
    (router._refreshNextLoad || router._tx?.[6 /* refresh */])
  ) {
    return
  }
  const location = opts._builtLocation ?? router.buildLocation(opts)
  const base = router._committed
  const controller = new AbortController()
  let matches: Array<AnyRouteMatch>
  try {
    matches = router.matchRoutes(location, {
      _controller: controller,
    })
  } catch (cause) {
    controller.abort()
    if (!isNotFound(cause)) {
      console.error(cause)
    }
    return
  }
  router._preloads.set(controller, matches)
  let active: boolean
  try {
    let result: LaneResult
    try {
      result = await executeClientLane(router, location, matches, [
        controller,
        redirects,
        // Preload lanes run to completion even when unrelated navigations
        // commit: finished work seeds the cache.
        () => true,
        base,
        true,
      ])
    } finally {
      active = router._preloads.delete(controller)
      transferMatchResources(matches)
      controller.abort()
    }
    if (!isControl(result)) {
      return matches
    }
    if (
      active &&
      result[0 /* kind */] === REDIRECTED &&
      !result[1 /* redirect */].options.reloadDocument
    ) {
      return preloadClientRoute(
        router,
        {
          ...result[1 /* redirect */].options,
          _fromLocation: location,
        },
        redirects + 1,
      )
    }
  } catch (cause) {
    if (!isNotFound(cause)) {
      console.error(cause)
    }
  }
  return
}

// --- SSR hydration (client entry via @tanstack/router-core/ssr/client) ---

declare global {
  interface Window {
    [GLOBAL_TSR]?: TsrSsrGlobal
    [GLOBAL_SEROVAL]?: any
  }
}

export async function hydrate(router: AnyRouter): Promise<void> {
  if (process.env.NODE_ENV !== 'production' && !window.$_TSR) {
    throw new Error(
      'Invariant failed: Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!',
    )
  }
  const tsr = window.$_TSR!

  const adapters = router.options.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined
  if (adapters?.length) {
    tsr.t = new Map(
      adapters.map((adapter) => [adapter.key, adapter.fromSerializable]),
    )
    tsr.buffer.forEach((script) => script())
  }
  tsr.initialized = true

  const dehydratedRouter = tsr.router
  if (process.env.NODE_ENV !== 'production' && !dehydratedRouter) {
    throw new Error(
      'Invariant failed: Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
    )
  }
  router.ssr = { manifest: dehydratedRouter!.manifest }
  const nonce = (
    document.querySelector('meta[property="csp-nonce"]') as
      | HTMLMetaElement
      | undefined
  )?.content
  router.options.ssr = { nonce }

  const dehydratedMatches = dehydratedRouter!.matches

  const controller = new AbortController()
  const previousPreflight = router._preflight
  router._preflight = controller
  previousPreflight?.abort()
  const retire = (cause?: unknown) => {
    if (router._preflight === controller) {
      router._preflight = undefined
    }
    controller.abort(cause)
    return false
  }
  const isCurrent = () =>
    (router._preflight === controller && !controller.signal.aborted) || retire()

  let location!: AnyRouter['latestLocation']
  let candidates!: Array<AnyRouteMatch>
  let handoffHistoryHref!: string
  let handoffHistoryState: unknown
  try {
    await waitFor(
      router.options.hydrate?.(dehydratedRouter!.dehydratedData),
      controller.signal,
    )
    if (!isCurrent()) {
      return
    }
    const historyLocation = router.history.location
    handoffHistoryHref = historyLocation.href
    handoffHistoryState = historyLocation.state
    router.updateLatestLocation()
    location = router.latestLocation
    router.stores.location.set(location)
    candidates = router.matchRoutes(location, {
      _controller: controller,
    })
  } catch (cause) {
    retire(cause)
    if (cause !== controller.signal) {
      throw cause
    }
  }
  if (!isCurrent()) {
    return
  }
  let committedEnd = 0
  let pendingBoundary: number | undefined
  let verifiedAssetEnd = 0
  const retryFrom = (index: number, assetEnd = index + 1) => {
    // The failing route's identity is still verified, but its client context
    // and assets are not. Present it as the boundary for the client retry.
    pendingBoundary = Math.min(pendingBoundary ?? index, index)
    verifiedAssetEnd = Math.min(verifiedAssetEnd, assetEnd)
    const removed = candidates.slice(index, committedEnd)
    committedEnd = index
    for (const match of removed) {
      if (
        getRoute(router, match).options.loader &&
        (match.status === 'success' ||
          (!match.invalid && 'loaderData' in match))
      ) {
        cacheLoaderMatch(
          router,
          // Phase jump: dehydrated server data is already past the loader
          // phase — the guard above verified a settled success (or transported
          // loaderData), so this clone is settled without a client settle.
          {
            ...match,
            status: 'success',
            error: undefined,
            preload: true,
          } as SettledMatch,
          router._cache.get(match.id),
        )
      }
    }
    transferMatchResources(removed)
  }

  // A longer server lane is valid only when the local match already caps the
  // branch at a global not-found boundary. Otherwise no transported work is
  // safe to attach to the shorter client lane.
  const shared =
    dehydratedMatches.length > candidates.length
      ? candidates.findIndex((match) => match._notFound) + 1
      : dehydratedMatches.length
  let isTerminal = false
  for (let index = 0; index < shared; index++) {
    const candidate = candidates[index]!
    const dehydrated = dehydratedMatches[index]!
    if (
      typeof dehydrated.i !== 'string' ||
      hydrateSsrMatchId(dehydrated.i) !== candidate.id
    ) {
      pendingBoundary ??= index
      break
    }
    verifiedAssetEnd = index + 1
    const route = getRoute(router, candidate)
    if (
      'l' in dehydrated ||
      (dehydrated.s === 'success' &&
        dehydrated.e === undefined &&
        route.options.loader)
    ) {
      candidate.loaderData = dehydrated.l
    }
    candidate.status = dehydrated.s
    candidate.ssr = dehydrated.ssr
    route.options.ssr = candidate.ssr
    candidate.updatedAt = dehydrated.u
    candidate.error = dehydrated.e
    candidate._notFound ||= dehydrated.g
    const terminal =
      candidate.status === 'error' ||
      candidate.status === 'notFound' ||
      candidate._notFound
    if (terminal) {
      isTerminal = true
      committedEnd = index + 1
      if (candidate.ssr === false || candidate.ssr === 'data-only') {
        pendingBoundary ??= index
      }
      break
    }
    if (candidate.status === 'pending') {
      pendingBoundary ??= index
      break
    }

    committedEnd = index + 1
    if (candidate.ssr === 'data-only') {
      pendingBoundary ??= index
    }
  }
  let verifiedContextEnd = verifiedAssetEnd

  if (!isTerminal && committedEnd === shared && shared < candidates.length) {
    pendingBoundary = shared
  }

  // Hooks observe structural membership. Execution remains limited to
  // the accepted server prefix.
  const chunks = candidates.slice(0, committedEnd).map(async (match) => {
    try {
      const route = getRoute(router, match)
      if (match._notFound) {
        await Promise.all([
          loadRouteChunk(route),
          loadRouteChunk(route, 'notFoundComponent'),
        ])
      } else {
        await loadRouteChunk(
          route,
          match.status === 'error'
            ? 'errorComponent'
            : match.status === 'notFound'
              ? 'notFoundComponent'
              : undefined,
        )
      }
      return true
    } catch {
      return false
    }
  })
  let chunkFailure = 0
  try {
    while (
      chunkFailure < chunks.length &&
      (await waitFor(chunks[chunkFailure]!, controller.signal))
    ) {
      chunkFailure++
    }
  } catch {
    isCurrent()
    return
  }
  if (!isCurrent()) {
    return
  }
  if (chunkFailure < committedEnd) {
    verifiedContextEnd = Math.min(verifiedContextEnd, chunkFailure)
    retryFrom(chunkFailure)
  }

  // The first pending match is already visible, so prepare its route context
  // without granting its beforeLoad or loader any hydration authority.
  const contextEnd = Math.max(
    pendingBoundary === committedEnd ? committedEnd + 1 : committedEnd,
    verifiedContextEnd,
  )
  for (let index = 0; index < contextEnd; index++) {
    const match = candidates[index]!
    const route = getRoute(router, match)
    const parentContext =
      candidates[index - 1]?.context ?? router.options.context ?? {}
    let routeContext
    if (route.options.context) {
      try {
        routeContext = match._ctx =
          route.options.context({
            deps: match.loaderDeps,
            params: match.params,
            context: parentContext,
            location,
            navigate: navigateFrom(router, location),
            buildLocation: router.buildLocation,
            cause: match.cause,
            abortController: controller,
            preload: false,
            matches: candidates,
            routeId: route.id,
          }) || {}
      } catch {
        if (!isCurrent()) {
          return
        }
        if (
          match.status !== 'error' &&
          match.status !== 'notFound' &&
          !match._notFound
        ) {
          retryFrom(index, index)
          break
        }
      }
      if (!isCurrent()) {
        return
      }
    }
    match.context = {
      ...parentContext,
      ...routeContext,
      ...(index < committedEnd && dehydratedMatches[index]!.b),
    }
  }

  await projectLane(
    router,
    [location, candidates] as any,
    controller.signal,
    0,
    verifiedAssetEnd,
  )
  if (!isCurrent()) {
    return
  }
  const needsClientLoad = pendingBoundary !== undefined || committedEnd < shared
  const committedMatches =
    isTerminal && committedEnd === shared
      ? candidates
      : candidates.slice(0, committedEnd)
  let presented = needsClientLoad ? candidates : committedMatches
  let dataOnlyAssetEnd: number | undefined
  if (needsClientLoad && pendingBoundary !== undefined) {
    const boundary = presented[pendingBoundary]!
    dataOnlyAssetEnd =
      boundary.status === 'success' &&
      boundary.ssr === 'data-only' &&
      boundary.error === undefined &&
      !boundary._notFound &&
      verifiedAssetEnd > pendingBoundary + 1
        ? verifiedAssetEnd
        : undefined
    presented = presented.slice()
    presented[pendingBoundary] = {
      ...boundary,
      status: 'pending',
      ssr: boundary.ssr === 'data-only' ? 'data-only' : false,
      _assetEnd: dataOnlyAssetEnd,
    }
  }

  const claim = () => {
    const historyLocation = router.history.location
    return needsClientLoad &&
      !router._tx &&
      historyLocation.href === handoffHistoryHref &&
      historyLocation.state === handoffHistoryState &&
      router._committed === committedMatches &&
      committedMatches.length &&
      !controller.signal.aborted
      ? controller
      : undefined
  }
  const handoff: NonNullable<AnyRouter['_handoff']> = [
    claim,
    (matches) => {
      if (router._handoff !== handoff) {
        return
      }
      const prefix = committedMatches.length
      if (
        !matches ||
        !claim() ||
        committedMatches.some((match, index) => match.id !== matches[index]?.id)
      ) {
        router._handoff = undefined
        controller.abort()
        return
      }
      let handoffAssetEnd = dataOnlyAssetEnd
      if (handoffAssetEnd !== undefined) {
        for (let index = prefix; index < handoffAssetEnd; index++) {
          if (candidates[index]?.id !== matches[index]?.id) {
            handoffAssetEnd =
              index > (pendingBoundary ?? -1) + 1 ? index : undefined
            break
          }
        }
      }
      const clones = committedMatches.map((match) => ({ ...match }))
      if (handoffAssetEnd !== undefined) {
        clones[pendingBoundary!]!._assetEnd = handoffAssetEnd
      }
      transferMatchResources(matches.splice(0, prefix, ...clones))
      for (let index = prefix; index < matches.length; index++) {
        const match = matches[index]!
        const hydrated = candidates[index]
        if (hydrated?.id === match.id && hydrated._ctx) {
          match._ctx = hydrated._ctx
        }
        match.abortController = controller
      }
      return prefix
    },
  ]
  router._committed = committedMatches
  router._handoff = handoff
  router._preflight = undefined
  router.batch(() => {
    router.stores.setMatches(presented)
    router.stores.status.set('idle')
    if (!needsClientLoad) {
      router.stores.resolvedLocation.set(router.stores.location.get())
    }
  })
}
