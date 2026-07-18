// Keep this filename free of a secondary extension so declaration generation
// can rewrite relative imports for both ESM and CJS.
import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import { loadRouteChunk } from './route-chunks'
import { getLocationChangeInfo } from './router'
import { deepEqual } from './utils'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './Matches'
import type { NotFoundError } from './not-found'
import type {
  AnyRoute,
  BeforeLoadContextOptions,
  LoaderFnContext,
} from './route'
import type { AnyRedirect } from './redirect'
import type { AnyRouter } from './router'

declare const lanePhase: unique symbol

type Lane<
  TPhase extends 'matched' | 'contextualized' | 'reduced' | 'projected',
> = {
  readonly [lanePhase]?: TPhase
  location: ParsedLocation
  matches: Array<WorkMatch>
  background?: Array<BackgroundLoaderTask>
}

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

type LoaderOutcome =
  | [typeof SUCCESS, data: unknown]
  | [typeof ERROR, error: unknown]
  | [typeof NOT_FOUND, error: NotFoundError]
  | [typeof REDIRECTED, redirect: AnyRedirect]
  | [typeof CANCELED]

type IndexedOutcome = [index: number, outcome: LoaderOutcome]

type LoaderFlight = [
  outcome: Promise<LoaderOutcome>,
  controller: AbortController,
  leases: number,
]

type WorkMatch = AnyRouteMatch & {
  _flight?: LoaderFlight
}

export type LoadTransaction = {
  location: ParsedLocation
  controller: AbortController
  matches: Array<AnyRouteMatch>
  done: Promise<void>
  redirects?: number
  redirecting?: true
}

type PreloadFlight = [
  matches: Array<AnyRouteMatch>,
  controller: AbortController,
  promise: Promise<LaneResult>,
  claim?: LoadTransaction,
]

export type PendingSession = {
  owner: LoadTransaction
  boundary: number
  /** Pending reveal time until acknowledged, then minimum-visible-until time. */
  deadline: number
  timer?: ReturnType<typeof setTimeout>
  ack?: Promise<boolean>
}

type CoordinatorRouter = AnyRouter & {
  /** Cancels reentrant synchronous planning without replacing the current writer. */
  _preflight?: AbortController
  /** Full preload lanes that can be claimed by an identical navigation. */
  _preloads?: Set<PreloadFlight>
}

type LoaderTask = {
  outcome: Promise<LoaderOutcome>
  ready: Promise<IndexedOutcome | undefined>
  match?: Promise<WorkMatch>
}

type BackgroundLoaderTask = LoaderTask & {
  index: number
  candidate: WorkMatch
}

type ExecuteLaneOptions = {
  preload?: boolean
  sync?: boolean
  forceStaleReload?: boolean
  controller: AbortController
  base?: Array<AnyRouteMatch>
  resolvedPrefix?: number
  redirects?: number
  onReady?: () => void
}

type ControlOutcome =
  | [typeof REDIRECTED, redirect: AnyRedirect]
  | [typeof CANCELED]

type LaneResult = ProjectedLane | ControlOutcome

function waitFor<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw signal
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal)
    signal.addEventListener('abort', abort)
    Promise.resolve(value)
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', abort)
      })
  })
}

function getRoute(router: AnyRouter, match: WorkMatch): AnyRoute {
  return (router.routesById as Record<string, AnyRoute>)[match.routeId]!
}

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
  return rejected ? [ERROR, value] : [SUCCESS, value]
}

function normalizeError(route: AnyRoute, cause: unknown): LoaderOutcome {
  let outcome = normalize(cause, true, route.id)
  if (outcome[0] !== ERROR) {
    return outcome
  }
  try {
    route.options.onError?.(cause)
  } catch (onErrorCause) {
    outcome = normalize(onErrorCause, true, route.id)
  }
  return outcome
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
): Promise<IndexedOutcome | undefined> {
  const signal = options.controller.signal
  for (
    let index = options.resolvedPrefix ?? 0;
    index < lane.matches.length;
    index++
  ) {
    const match = lane.matches[index]!
    const route = getRoute(router, match)

    match.abortController = options.controller
    // Contextualization is serial, so the previous match already contains the
    // complete parent context for this route.
    const parentContext =
      lane.matches[index - 1]?.context ?? router.options.context ?? {}
    const context = {
      ...parentContext,
      ...match.__routeContext,
    }
    match.context = context
    const validationError = match.paramsError ?? match.searchError

    if (validationError !== undefined) {
      match.__beforeLoadContext = {}
      releaseFlight(match)
      return [index, normalizeError(route, validationError)]
    }

    const beforeLoad = route.options.beforeLoad
    match.__beforeLoadContext = {}
    if (!beforeLoad) {
      continue
    }

    const preload = !!options.preload
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
      search: match.search,
      abortController: match.abortController,
      params: match.params,
      preload,
      context,
      location: lane.location,
      navigate: navigateFrom(router, lane.location),
      buildLocation: router.buildLocation,
      cause: preload ? 'preload' : match.cause,
      matches: lane.matches,
      routeId: route.id,
      ...router.options.additionalContext,
    }

    try {
      match.isFetching = 'beforeLoad'
      const result = await waitFor(beforeLoad(beforeLoadContext), signal)
      match.isFetching = false
      const outcome = normalize(result, false, route.id)
      if (outcome[0] !== SUCCESS) {
        releaseFlight(match)
        return [index, outcome]
      }
      match.__beforeLoadContext = result
      match.context = {
        ...context,
        ...result,
      }
    } catch (cause) {
      match.isFetching = false
      if (cause === signal && signal.aborted) {
        return [index, [CANCELED]]
      }
      if (cause instanceof Promise) {
        throw cause
      }
      releaseFlight(match)
      return [index, normalizeError(route, cause)]
    }
  }

  return
}

function releaseFlight(match: WorkMatch): void {
  const flight = match._flight
  if (!flight) {
    return
  }
  match._flight = undefined
  if (!--flight[2]) {
    flight[1].abort()
  }
}

/**
 * Not passing in a `next` ownership recipient
 * is equivalent to discarding the match resources
 */
export function transferMatchResources(
  previous: Array<AnyRouteMatch>,
  next?: Array<AnyRouteMatch>,
): void {
  for (const match of previous as Array<WorkMatch>) {
    if (!next?.includes(match)) {
      releaseFlight(match)
    }
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
  return {
    params: match.params,
    deps: match.loaderDeps,
    preload,
    parentMatchPromise: parentMatchPromise as any,
    abortController: controller,
    context: match.context,
    location: lane.location,
    navigate: navigateFrom(router, lane.location),
    cause: preload ? 'preload' : match.cause,
    route,
    ...router.options.additionalContext,
  }
}

async function loadResource(
  router: AnyRouter,
  lane: ContextualizedLane,
  match: WorkMatch,
  route: AnyRoute,
  parentMatchPromise: Promise<WorkMatch> | undefined,
  preload: boolean,
  signal: AbortSignal,
): Promise<LoaderOutcome> {
  if (signal.aborted) {
    return [CANCELED]
  }
  const routeLoader = route.options.loader
  const loader =
    typeof routeLoader === 'function' ? routeLoader : routeLoader?.handler
  if (!loader) {
    return [SUCCESS, undefined]
  }

  releaseFlight(match)
  const controller = new AbortController()
  const flight: LoaderFlight = [
    Promise.resolve()
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
        (value) =>
          controller.signal.aborted
            ? [CANCELED]
            : normalize(value, false, route.id),
        (cause) =>
          controller.signal.aborted ? [CANCELED] : normalizeError(route, cause),
      ),
    controller,
    1,
  ]
  match._flight = flight
  match.abortController = controller
  match.isFetching = 'loader'
  try {
    return await waitFor(flight[0], signal)
  } catch (cause) {
    if (cause === signal) {
      releaseFlight(match)
      return [CANCELED]
    }
    throw cause
  }
}

function applySuccess(match: WorkMatch, data: unknown): void {
  match.loaderData = data
  match.error = undefined
  match.status = 'success'
  match.invalid = false
  match.isFetching = false
  match.updatedAt = Date.now()
}

function createLoaderTask(
  router: AnyRouter,
  lane: ContextualizedLane,
  index: number,
  tasks: Array<LoaderTask>,
  semanticParent: Promise<WorkMatch> | undefined,
  options: ExecuteLaneOptions,
): Promise<WorkMatch> {
  const match = lane.matches[index]!
  const route = getRoute(router, match)
  const preload = !!options.preload
  const signal = options.controller.signal
  let reload = false
  let reloadFailure: LoaderOutcome | undefined
  try {
    if (index >= (options.resolvedPrefix ?? 0)) {
      if (match.status !== 'success') {
        reload = true
      } else {
        let configured = route.options.shouldReload
        if (typeof configured === 'function') {
          configured = configured(
            getLoaderContext(
              router,
              lane,
              match,
              route,
              options.controller,
              tasks[index - 1]?.match,
              preload,
            ),
          )
        }
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
            (options.forceStaleReload ||
              match.cause === 'enter' ||
              options.base?.some(
                (candidate) =>
                  candidate.routeId === match.routeId &&
                  candidate.id !== match.id,
              )))
        )
      }
    }
  } catch (cause) {
    releaseFlight(match)
    reloadFailure = normalizeError(route, cause)
  }
  const routeLoader = route.options.loader
  const background =
    routeLoader &&
    reload &&
    match.status === 'success' &&
    !preload &&
    !options.sync &&
    ((typeof routeLoader === 'function'
       ? undefined
       : routeLoader?.staleReloadMode) ??
      router.options.defaultStaleReloadMode) !== 'blocking'
  const skippedPreload = preload && route.options.preload === false
  const loaded = reload && !skippedPreload
  if (skippedPreload) {
    match.status = 'success'
    match.invalid = true
    match.isFetching = false
  }
  const rawOutcome = reloadFailure
    ? Promise.resolve(reloadFailure)
    : !loaded || background
      ? Promise.resolve<LoaderOutcome>([SUCCESS, match.loaderData])
      : loadResource(
          router,
          lane,
          match,
          route,
          tasks[index - 1]?.match,
          preload,
          signal,
        )
  const outcome = rawOutcome.then((result) => {
    if (loaded && !background && result[0] === SUCCESS) {
      applySuccess(match, result[1])
      match.preload = preload
    }
    return result
  })

  const chunkFailure = background
    ? undefined
    : Promise.resolve()
        .then(() => loadRouteChunk(route))
        .then(
          () => undefined,
          (cause): IndexedOutcome => [index, normalizeError(route, cause)],
        )
  const ready = outcome
    .then((value) => (value[0] === SUCCESS ? chunkFailure : undefined))
    .then((value) => {
      options.onReady?.()
      return value
    })

  const matchPromise = outcome.then(() => match)
  tasks.push({ outcome, ready, match: matchPromise })
  if (!background) {
    return matchPromise
  }
  const candidate: WorkMatch = {
    ...match,
    _flight: undefined,
  }
  const backgroundOutcome = loadResource(
    router,
    lane,
    candidate,
    route,
    semanticParent,
    false,
    signal,
  ).then((result) => {
    if (result[0] === SUCCESS) {
      applySuccess(candidate, result[1])
    }
    return result
  })
  ;(lane.background ??= []).push({
    index,
    candidate,
    outcome: backgroundOutcome,
    ready,
  })
  return backgroundOutcome.then(() => candidate)
}

function getNotFoundBoundary(
  router: AnyRouter,
  matches: Array<WorkMatch>,
  indexed: IndexedOutcome,
): number {
  const [throwingIndex, outcome] = indexed
  const cause = outcome[1] as NotFoundError
  let index = cause.routeId
    ? matches.findIndex((match) => match.routeId === cause.routeId)
    : throwingIndex
  if (index < 0) {
    index = 0
  }
  for (let i = index; i >= 0; i--) {
    if (getRoute(router, matches[i]!).options.notFoundComponent) {
      return i
    }
  }
  return cause.routeId ? index : 0
}

async function reduceLane(
  router: AnyRouter,
  lane: ContextualizedLane,
  tasks: Array<LoaderTask>,
  options: ExecuteLaneOptions,
  serialFailure?: IndexedOutcome,
): Promise<ReducedLane | ControlOutcome> {
  // Background reductions do not compare against the committed lane.
  const background = !options.base
  let control =
    (serialFailure?.[1][0] ?? 0) >= REDIRECTED ? serialFailure : undefined
  let loaderFailure: IndexedOutcome | undefined

  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index]!
    const outcome = await task.outcome
    const taskIndex = (task as BackgroundLoaderTask).index ?? index
    if (outcome[0] >= REDIRECTED) {
      control = [taskIndex, outcome]
      break
    }
    if (outcome[0] !== SUCCESS) {
      loaderFailure ||= [taskIndex, outcome]
    }
  }

  let failure = loaderFailure ?? serialFailure

  if (
    control?.[1][0] === REDIRECTED &&
    !control[1][1].options.reloadDocument &&
    (options.redirects ?? 0) >= 20
  ) {
    failure = [control[0], [ERROR, new Error('Redirect cycle detected')]]
    control = undefined
  }

  if (!control) {
    const readinessEnd = failure
      ? failure[1][0] === NOT_FOUND
        ? getNotFoundBoundary(router, lane.matches, failure)
        : failure[0]
      : lane.matches.length
    for (let index = 0; index < tasks.length; index++) {
      const task = tasks[index]!
      if (((task as BackgroundLoaderTask).index ?? index) >= readinessEnd) {
        break
      }
      const chunkFailure = await (process.env.NODE_ENV !== 'production'
        ? waitFor(task.ready, options.controller.signal)
        : task.ready)
      if (chunkFailure) {
        if (chunkFailure[1][0] === REDIRECTED) {
          if (
            !chunkFailure[1][1].options.reloadDocument &&
            (options.redirects ?? 0) >= 20
          ) {
            failure = [
              chunkFailure[0],
              [ERROR, new Error('Redirect cycle detected')],
            ]
          } else {
            control = chunkFailure
          }
        } else {
          failure = chunkFailure
        }
        break
      }
    }
  }

  if (control) {
    if (lane.background) {
      transferMatchResources(lane.background.map((task) => task.candidate))
      lane.background = undefined
    }
    return control[1] as ControlOutcome
  }

  if (failure) {
    const [index, outcome] = failure
    const kind = outcome[0]
    const boundary =
      kind === NOT_FOUND
        ? getNotFoundBoundary(router, lane.matches, failure)
        : index
    let match = lane.matches[boundary]!
    if (
      background &&
      !(tasks as Array<BackgroundLoaderTask>).some(
        (task) => task.index === boundary,
      )
    ) {
      match = lane.matches[boundary] = { ...match, _flight: undefined }
    }
    const cause = outcome[1]
    match.globalNotFound = undefined
    if (kind === ERROR) {
      match.status = 'error'
    } else {
      ;(cause as NotFoundError).routeId = match.routeId
      if (match.routeId === router.routeTree.id) {
        match.status = 'success'
        match.globalNotFound = true
      } else {
        match.status = 'notFound'
      }
    }
    match.error = cause
    match.isFetching = false
    try {
      await loadRouteChunk(
        getRoute(router, match),
        kind === ERROR ? 'errorComponent' : 'notFoundComponent',
      )
    } catch {}
    const length = boundary + 1
    if (!background) {
      transferMatchResources(lane.matches.slice(length))
      if (lane.background) {
        let write = 0
        for (const task of lane.background) {
          if (task.index < length) {
            lane.background[write++] = task
          } else {
            transferMatchResources([task.candidate])
          }
        }
        lane.background.length = write
      }
    }
    lane.matches.length = length
    return lane as ReducedLane
  }

  return lane as ReducedLane
}

async function projectLane(
  router: AnyRouter,
  lane: ReducedLane,
  signal: AbortSignal,
  start = 0,
): Promise<ProjectedLane> {
  for (
    let index = start;
    index < lane.matches.length && !signal.aborted;
    index++
  ) {
    const match = lane.matches[index]!
    const routeOptions = getRoute(router, match).options
    if (routeOptions.head || routeOptions.scripts) {
      try {
        const context = {
          ssr: router.options.ssr,
          matches: lane.matches,
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
        if (!signal.aborted) {
          console.error(cause)
        }
      }
    }
  }
  return lane as ProjectedLane
}

async function executeClientLane(
  router: AnyRouter,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  options: ExecuteLaneOptions,
): Promise<LaneResult> {
  const matched: MatchedLane = {
    location,
    matches: matches as Array<WorkMatch>,
  }
  for (const match of matched.matches) {
    const flight = match._flight
    if (flight) {
      flight[2]++
    }
  }
  const failure = await contextualize(router, matched, options)
  if (failure) {
    options.sync = true
  }
  const contextualized = matched as ContextualizedLane
  const tasks: Array<LoaderTask> = []
  let semanticParent: Promise<WorkMatch> | undefined
  let end = failure?.[0] ?? contextualized.matches.length
  if (failure?.[1][0] === NOT_FOUND) {
    end = Math.min(
      end,
      getNotFoundBoundary(router, contextualized.matches, failure) + 1,
    )
  } else if ((failure?.[1][0] ?? 0) >= REDIRECTED) {
    end = 0
  }
  for (let index = 0; index < end; index++) {
    if (options.controller.signal.aborted) {
      break
    }
    semanticParent = createLoaderTask(
      router,
      contextualized,
      index,
      tasks,
      semanticParent,
      options,
    )
  }
  const reduced = await reduceLane(
    router,
    contextualized,
    tasks,
    options,
    failure,
  )
  if (Array.isArray(reduced)) {
    return reduced
  }
  return projectLane(
    router,
    reduced,
    options.controller.signal,
    Math.min(options.resolvedPrefix ?? 0, reduced.matches.length - 1),
  )
}

function semanticMatches(router: CoordinatorRouter): Array<AnyRouteMatch> {
  return router._committedMatches ?? router.stores.matches.get()
}

function sameLane(
  left: Array<AnyRouteMatch>,
  right: Array<AnyRouteMatch>,
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (match, index) =>
        match.id === right[index]!.id &&
        deepEqual(match.params, right[index]!.params, false) &&
        deepEqual(match.search, right[index]!.search, false),
    )
  )
}

/**
 * Finds the first route that should show pending UI and its two timing values.
 * A fallback already on screen remains selected after its route loads, so we
 * do not jump to a child fallback. Matches put back into pending by invalidation
 * skip pendingMs, and a route without a usable fallback blocks pending UI for deeper routes.
 */
function pendingConfig(
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
): [delay: number, boundary: number, min: number] | undefined | void {
  const presented = router.stores.matches.get()
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!
    const success = match.status === 'success'
    const visible =
      success &&
      presented[index]?.id === match.id &&
      presented[index]?.status === 'pending'
    if (success && !visible) {
      continue
    }
    const route = getRoute(router, match as WorkMatch)
    const delay =
      visible || match.invalid
        ? 0
        : (route.options.pendingMs ?? router.options.defaultPendingMs)
    return (route.options.pendingComponent ??
      (router.options as any).defaultPendingComponent) &&
      typeof delay === 'number' &&
      delay !== Infinity
      ? [
          delay,
          index,
          route.options.pendingMinMs ?? router.options.defaultPendingMinMs ?? 0,
        ]
      : undefined
  }
}

/**
 * Waits for `pendingMs`, then writes the chosen route and its parents to
 * `stores.matches`, causing its fallback to render while children stay hidden.
 * A replacement load for the same match keeps the timer; choosing a different
 * match resets it. `pendingMinMs` starts after the fallback renders.
 */
function offerPending(router: CoordinatorRouter, tx: LoadTransaction): void {
  if (router._tx !== tx) {
    return
  }
  let session = router._pending
  const sessionMatchId = session?.owner.matches[session.boundary]?.id
  if (session?.owner !== tx) {
    if (session && tx.matches[session.boundary]?.id === sessionMatchId) {
      session.owner = tx
    } else {
      clearTimeout(session?.timer)
      router._pending = session = undefined
    }
  }
  const config = pendingConfig(router, tx.matches)
  if (!config) {
    return
  }
  const [delay, boundary, min] = config
  const matchId = tx.matches[boundary]!.id
  if (!session || session.boundary !== boundary || sessionMatchId !== matchId) {
    // Hydration and redirects can preserve pending presentation without a session.
    // Do not delay it again; conservatively start pendingMinMs from now.
    clearTimeout(session?.timer)
    const presented = router.stores.matches.get()[boundary]
    const visible = presented?.id === matchId && presented.status === 'pending'
    router._pending = session = {
      owner: tx,
      boundary,
      deadline: Date.now() + (visible ? min : delay),
      ack: visible ? Promise.resolve(true) : undefined,
    }
  }
  if (session.ack) {
    return
  }
  clearTimeout(session.timer)
  const remaining = session.deadline - Date.now()
  if (remaining > 0) {
    session.timer = setTimeout(() => {
      offerPending(router, tx)
    }, remaining)
    return
  }
  const offered = tx.matches
    .slice(0, boundary + 1)
    .map((match) => ({ ...match, _flight: undefined }))
  offered[boundary]!.status = 'pending'
  session.ack = router
    .startTransition(() => {
      router.stores.setMatches(offered)
    })
    .then((rendered) => {
      if (rendered && router._pending === session) {
        session.deadline = Date.now() + min
      }
      return rendered
    })
}

/**
 * Cancels pending UI timing when its load ends. The ownership check prevents
 * an older, superseded load from clearing pending UI that a newer load took over.
 */
function finishPending(router: CoordinatorRouter, tx: LoadTransaction): void {
  const session = router._pending
  if (session?.owner === tx) {
    clearTimeout(session.timer)
    router._pending = undefined
  }
}

function publishMatches(
  router: CoordinatorRouter,
  matches: Array<AnyRouteMatch>,
  previous: Array<AnyRouteMatch>,
): void {
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!
    const oldMatch = previous[index]
    if (match !== oldMatch) {
      match.fetchCount =
        (oldMatch?.routeId === match.routeId ? oldMatch!.fetchCount : 0) + 1
    }
  }
  router.stores.setMatches(matches)
  router._committedMatches = matches
}

function commitMatches(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  matches: Array<AnyRouteMatch>,
): void {
  const stores = router.stores
  const previous = semanticMatches(router)
  const previousCached = stores.cachedMatches.get()
  for (const match of matches) {
    match.preload = false
  }
  const nextIds = new Set(matches.map((match) => match.id))
  const cached = previousCached.filter((match) => !nextIds.has(match.id))
  for (const match of previous) {
    if (!nextIds.has(match.id)) {
      cached.push({
        ...match,
        __beforeLoadContext: undefined,
        context: {},
        _flight: undefined,
      } as WorkMatch)
    }
  }

  const now = Date.now()
  let write = 0
  for (const match of cached) {
    const route = getRoute(router, match)
    const gcTime = match.preload
      ? (route.options.preloadGcTime ??
        router.options.defaultPreloadGcTime ??
        300_000)
      : (route.options.gcTime ?? router.options.defaultGcTime ?? 300_000)
    if (
      match.status === 'success' &&
      route.options.loader &&
      now - match.updatedAt < gcTime
    ) {
      cached[write++] = match
    }
  }
  cached.length = write

  router.batch(() => {
    publishMatches(router, matches, previous)
    stores.setCached(cached)
  })
  transferMatchResources(
    [...previousCached, ...previous],
    [...matches, ...cached],
  )
  tx.matches = []

  const count = Math.max(previous.length, matches.length)
  for (let index = 0; index < count; index++) {
    const oldMatch = previous[index]
    const match = matches[index]
    if (oldMatch && oldMatch.routeId !== match?.routeId) {
      try {
        getRoute(router, oldMatch as WorkMatch).options.onLeave?.(oldMatch)
      } catch (cause) {
        console.error(cause)
      }
    }
    if (match) {
      try {
        getRoute(router, match as WorkMatch).options[
          oldMatch?.routeId === match.routeId ? 'onStay' : 'onEnter'
        ]?.(match)
      } catch (cause) {
        console.error(cause)
      }
    }
  }
}

async function awaitCurrent(
  router: CoordinatorRouter,
  owner?: LoadTransaction,
): Promise<void> {
  let current = router._tx
  while (current && current !== owner) {
    await current.done
    if (router._tx === current) {
      return
    }
    current = router._tx
  }
}

async function runBackground(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  base: Array<AnyRouteMatch>,
  tasks: Array<BackgroundLoaderTask>,
): Promise<void> {
  const backgroundMatches: Array<WorkMatch> = []
  const next = base.slice() as Array<WorkMatch>
  for (const task of tasks) {
    backgroundMatches.push(task.candidate)
    next[task.index] = task.candidate
  }
  const lane = {
    location: tx.location,
    matches: next,
  } as ContextualizedLane
  const options: ExecuteLaneOptions = {
    controller: tx.controller,
    redirects: tx.redirects,
  }
  const reduced = await reduceLane(router, lane, tasks, options)
  if (Array.isArray(reduced)) {
    transferMatchResources(backgroundMatches)
    if (
      reduced[0] === REDIRECTED &&
      router._tx === tx &&
      router._committedMatches === base
    ) {
      tx.redirects = (tx.redirects ?? 0) + 1
      tx.redirecting = true
      await router.navigate({
        ...reduced[1].options,
        replace: true,
        ignoreBlocker: true,
      })
      tx.redirecting = undefined
    }
    return
  }
  const projected = await projectLane(
    router,
    {
      ...reduced,
      matches: reduced.matches.map((match) => ({
        ...match,
        _flight: undefined,
      })),
    },
    tx.controller.signal,
  )
  if (
    tx.controller.signal.aborted ||
    router._tx !== tx ||
    router._committedMatches !== base
  ) {
    transferMatchResources(backgroundMatches)
    return
  }
  for (let index = 0; index < projected.matches.length; index++) {
    const source = reduced.matches[index]!
    const target = projected.matches[index]!
    target._flight = source._flight
    source._flight = undefined
    if (source === base[index]) {
      base[index] = target
    }
  }
  router.batch(() => {
    publishMatches(router, projected.matches, base)
  })
  transferMatchResources([...base, ...backgroundMatches], projected.matches)
}

async function runClientTransaction(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  forceStaleReload: boolean,
  onReady?: () => void,
  sync?: boolean,
  resolvedPrefix?: number,
  preload?: PreloadFlight,
): Promise<void> {
  const options: ExecuteLaneOptions = {
    controller: tx.controller,
    forceStaleReload,
    sync: !!preload || sync,
    base: semanticMatches(router),
    resolvedPrefix,
    redirects: tx.redirects,
    onReady,
  }
  let result = preload
    ? await waitFor(preload[2], tx.controller.signal)
    : undefined
  if (router._tx !== tx) {
    preload?.[1].abort()
    transferMatchResources(tx.matches)
    return
  }
  if (result && !Array.isArray(result) && tx.matches === result.matches) {
    tx.controller.abort()
    tx.controller = preload![1]
  } else {
    if (preload) {
      for (const match of tx.matches) {
        match.invalid = true
      }
    }
    result = await executeClientLane(router, tx.location, tx.matches, options)
  }

  if (Array.isArray(result)) {
    finishPending(router, tx)
    transferMatchResources(tx.matches)
    if (result[0] === REDIRECTED && router._tx === tx) {
      tx.redirects = (tx.redirects ?? 0) + 1
      tx.redirecting = true
      await router.navigate({
        ...result[1].options,
        replace: true,
        ignoreBlocker: true,
      })
      tx.redirecting = undefined
    }
    return
  }
  tx.redirects = undefined
  const pending = router._pending
  if (pending?.owner === tx) {
    /**
     * Loading finished, so cancel any pending reveal. If the fallback rendered,
     * wait out the rest of `pendingMinMs` before replacing it. If it never
     * rendered, there is no minimum wait; if another load took it over, that
     * load owns the deadline.
     */
    clearTimeout(pending.timer)
    if (pending.ack) {
      const rendered = await pending.ack
      if (rendered && router._pending === pending && pending.owner === tx) {
        const remaining = pending.deadline - Date.now()
        if (remaining > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, remaining))
        }
      }
    }
  }
  if (tx.controller.signal.aborted || router._tx !== tx) {
    finishPending(router, tx)
    transferMatchResources(result.matches)
    return
  }
  const toLocation = tx.location
  const changeInfo = getLocationChangeInfo(
    toLocation,
    router.stores.resolvedLocation.get(),
  )
  await router.startViewTransition(async () => {
    if (tx.controller.signal.aborted || router._tx !== tx) {
      transferMatchResources(result.matches)
      return
    }
    const commit = () => {
      if (result.background?.length) {
        void runBackground(router, tx, result.matches, result.background).catch(
          console.error,
        )
      }
      finishPending(router, tx)
      commitMatches(router, tx, result.matches)
      if (router._tx !== tx) {
        return
      }
      router.emit({ type: 'onLoad', ...changeInfo })
      if (router._tx === tx) {
        router.emit({ type: 'onBeforeRouteMount', ...changeInfo })
      }
    }
    const rendered = await router.startTransition(commit)
    if (router._tx !== tx) {
      return
    }
    router.batch(() => {
      router.stores.resolvedLocation.set(toLocation)
      router.stores.status.set('idle')
      if (router._tx === tx) {
        router.emit({ type: 'onResolved', ...changeInfo })
      }
      if (rendered) {
        router.emit({ type: 'onRendered', ...changeInfo })
      }
    })
    if (router._tx !== tx) {
      return
    }
    router.commitLocationPromise?.resolve()
    router.commitLocationPromise = undefined
  })
}

export async function loadClientRoute(
  router: CoordinatorRouter,
  opts?: {
    sync?: boolean
    /** @internal */
    _refreshRouteId?: string
  },
): Promise<void> {
  const refreshRouteId =
    process.env.NODE_ENV !== 'production' ? opts?._refreshRouteId : undefined
  const canReuse = refreshRouteId
    ? (route: AnyRoute) => {
        for (let current: AnyRoute | undefined = route; current; ) {
          if (current.id === refreshRouteId) {
            return false
          }
          current = current.parentRoute as AnyRoute | undefined
        }
        return true
      }
    : undefined
  const committed = (router._committedMatches ??= router.stores.matches.get())
  const previousOwner = router._tx
  const resolvedLocation = router.stores.resolvedLocation.get()
  const previousLocation = resolvedLocation ?? router.stores.location.get()
  const controller = new AbortController()
  router._preflight?.abort()
  router._preflight = controller

  const location = router.latestLocation
  let matches: Array<AnyRouteMatch>
  try {
    matches = router.matchRoutes(
      location,
      process.env.NODE_ENV !== 'production' && canReuse
        ? { _controller: controller, _canReuse: canReuse }
        : { _controller: controller },
    )
  } catch (cause) {
    const stale = controller.signal.aborted || router._tx !== previousOwner
    controller.abort()
    if (stale) {
      await awaitCurrent(router, previousOwner)
      return
    }
    if (!isRedirect(cause)) {
      await awaitCurrent(router)
      router.commitLocationPromise?.resolve()
      router.commitLocationPromise = undefined
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

  if (controller.signal.aborted || router._tx !== previousOwner) {
    controller.abort()
    await awaitCurrent(router, previousOwner)
    return
  }
  router._preflight = undefined
  const sameHref = previousLocation.href === location.href

  let resolvedPrefix: number | undefined
  if (
    !refreshRouteId &&
    router.ssr &&
    !resolvedLocation &&
    sameHref &&
    previousLocation.state.__TSR_key === location.state.__TSR_key &&
    committed.every(
      (match, index) => !match.invalid && match.id === matches[index]?.id,
    )
  ) {
    resolvedPrefix = committed.length
    if (
      resolvedPrefix &&
      (committed[resolvedPrefix - 1]!.status !== 'success' ||
        committed[resolvedPrefix - 1]!.globalNotFound)
    ) {
      matches.length = resolvedPrefix
    }
  }

  const preload =
    !refreshRouteId && resolvedPrefix === undefined
      ? Array.from(router._preloads ?? []).find(
          (flight) =>
            !flight[0].some(
              (match) =>
                getRoute(router, match as WorkMatch).options.preload === false,
            ) && sameLane(flight[0], matches),
        )
      : undefined

  const tx: LoadTransaction = {
    location,
    controller,
    matches,
    done: Promise.resolve()
      .then(() =>
        runClientTransaction(
          router,
          tx,
          refreshRouteId ? false : sameHref,
          refreshRouteId ? undefined : () => offerPending(router, tx),
          opts?.sync,
          resolvedPrefix,
          preload,
        ),
      )
      .catch(() => {
        if (router._tx === tx) {
          finishPending(router, tx)
          tx.controller.abort()
          transferMatchResources(tx.matches)
          router.batch(() => {
            router.stores.status.set('idle')
            router.stores.setMatches(router._committedMatches ?? [])
          })
          if (router._tx !== tx) {
            return
          }
          router.commitLocationPromise?.resolve()
          router.commitLocationPromise = undefined
        }
      }),
    redirects: previousOwner?.redirecting ? previousOwner.redirects : undefined,
  }
  router._tx = tx
  if (preload) {
    for (const match of tx.matches as Array<WorkMatch>) {
      match._flight = undefined
    }
    preload[3] = tx
  }
  previousOwner?.controller.abort()
  if (previousOwner) {
    transferMatchResources(previousOwner.matches)
  }

  router.batch(() => {
    router.stores.status.set('pending')
    router.stores.location.set(location)
  })
  if (!refreshRouteId) {
    offerPending(router, tx)
  }

  try {
    await tx.done
  } finally {
    await awaitCurrent(router, tx)
  }
}

export function refreshClientRoute(
  router: CoordinatorRouter,
  routeId: string,
): Promise<void> {
  if (router._preloads) {
    for (const preload of router._preloads) {
      preload[1].abort()
    }
    router._preloads.clear()
  }
  router.clearCache()

  return loadClientRoute(router, { sync: true, _refreshRouteId: routeId })
}

async function runPreloadFlight(
  router: CoordinatorRouter,
  flight: PreloadFlight,
  location: ParsedLocation,
  base: Array<AnyRouteMatch>,
  plannedCache: Array<AnyRouteMatch>,
): Promise<LaneResult> {
  try {
    let resolvedPrefix = 0
    while (
      base[resolvedPrefix]?.status === 'success' &&
      base[resolvedPrefix]?.id === flight[0][resolvedPrefix]?.id
    ) {
      resolvedPrefix++
    }
    const result = await executeClientLane(router, location, flight[0], {
      controller: flight[1],
      preload: true,
      base,
      resolvedPrefix,
    })
    if (flight[1].signal.aborted || Array.isArray(result)) {
      transferMatchResources(flight[0])
      return flight[1].signal.aborted ? [CANCELED] : result
    }

    const matches = result.matches
    if (matches.some((match) => match.status !== 'success')) {
      transferMatchResources(matches)
      return result
    }

    const claim = flight[3]
    const previous = router.stores.cachedMatches.get()
    if (
      claim &&
      router._tx === claim &&
      previous === plannedCache &&
      semanticMatches(router) === base &&
      !matches.some((match) => match.invalid || match.globalNotFound)
    ) {
      claim.matches = matches
      return result
    }

    const active = new Set(semanticMatches(router).map((match) => match.id))
    const candidates: Array<AnyRouteMatch> = []
    for (const match of matches) {
      if (
        match.invalid ||
        !getRoute(router, match).options.loader ||
        active.has(match.id) ||
        previous.find((candidate) => candidate.id === match.id) !==
          plannedCache.find((candidate) => candidate.id === match.id)
      ) {
        releaseFlight(match)
        continue
      }
      candidates.push({
        ...match,
        __beforeLoadContext: undefined,
        context: {},
      })
      match._flight = undefined
    }
    const ids = new Set(candidates.map((match) => match.id))
    const cached = previous
      .filter((match) => !ids.has(match.id))
      .concat(candidates)
    router.stores.setCached(cached)
    transferMatchResources(previous, [...cached, ...semanticMatches(router)])
    return result
  } catch (cause) {
    transferMatchResources(flight[0])
    if (flight[1].signal.aborted) {
      return [CANCELED]
    }
    throw cause
  } finally {
    router._preloads?.delete(flight)
    if (flight[3]?.matches !== flight[0]) {
      flight[1].abort()
    }
  }
}

export async function preloadClientRoute(
  router: CoordinatorRouter,
  opts: any,
  redirects = 0,
): Promise<Array<AnyRouteMatch> | undefined> {
  if (redirects > 20) {
    return
  }
  const owner = router._tx
  const location = opts._builtLocation ?? router.buildLocation(opts)
  const base = semanticMatches(router)
  const plannedCache = router.stores.cachedMatches.get()
  const controller = new AbortController()
  let matches: Array<AnyRouteMatch> | undefined
  try {
    matches = router.matchRoutes(location, {
      throwOnError: true,
      preload: true,
      _controller: controller,
      _isCurrent: () => router._tx === owner,
    })
    if (controller.signal.aborted || router._tx !== owner) {
      controller.abort()
      return
    }
    const existing = Array.from(router._preloads ?? []).find((flight) =>
      sameLane(flight[0], matches!),
    )
    const flight: PreloadFlight = existing ?? [
      matches,
      controller,
      Promise.resolve().then(() =>
        runPreloadFlight(router, flight, location, base, plannedCache),
      ),
    ]
    if (existing) {
      for (const match of matches as Array<WorkMatch>) {
        match._flight = undefined
      }
      controller.abort()
    } else {
      ;(router._preloads ??= new Set()).add(flight)
    }
    const result = await flight[2]
    if (Array.isArray(result)) {
      if (result[0] === REDIRECTED && !result[1].options.reloadDocument) {
        return preloadClientRoute(
          router,
          {
            ...result[1].options,
            _fromLocation: location,
          },
          redirects + 1,
        )
      }
      return
    }
    return result.matches
  } catch (cause) {
    if (!matches) {
      const stale = controller.signal.aborted || router._tx !== owner
      controller.abort()
      if (stale) {
        return
      }
      throw cause
    }
    controller.abort()
    transferMatchResources(matches)
    if (router._tx !== owner) {
      return
    }
    if (isRedirect(cause) && !cause.options.reloadDocument) {
      return preloadClientRoute(
        router,
        {
          ...cause.options,
          _fromLocation: location,
        },
        redirects + 1,
      )
    }
    if (!isNotFound(cause)) {
      console.error(cause)
    }
    return
  }
}
