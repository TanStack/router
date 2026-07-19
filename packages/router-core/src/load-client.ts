// Keep this filename free of a secondary extension so declaration generation
// can rewrite relative imports for both ESM and CJS.
import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import { loadRouteChunk } from './route-chunks'
import { _getRenderedMatches } from './rendered-matches'
import {
  _getUserHistoryState,
  getLocationChangeInfo,
  runRouteLifecycle,
} from './router'
import { deepEqual } from './utils'
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

declare const lanePhase: unique symbol

type Lane<
  TPhase extends 'matched' | 'contextualized' | 'reduced' | 'projected',
> = [
  location: ParsedLocation,
  matches: Array<WorkMatch>,
  background?: Array<BackgroundLoaderTask>,
  backgroundSettlement?: Promise<IndexedOutcome | undefined>,
] & { readonly [lanePhase]?: TPhase }

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

export type LoaderFlight = [
  outcome: Promise<LoaderOutcome>,
  controller: AbortController,
  leases: number,
]

type WorkMatch = AnyRouteMatch & {
  _flight?: LoaderFlight
}

export type ActivePreload = [
  matches: Array<AnyRouteMatch>,
  controller: AbortController,
  result: Promise<LaneResult>,
  semanticOwner: Array<AnyRouteMatch>,
  inputs: [
    context: unknown,
    additionalContext: unknown,
    state: object,
    search: object,
  ],
  routeTree: AnyRoute,
]

export type LoadTransaction = [
  controller: AbortController,
  redirects: number | undefined,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  startedAt: number,
  done: Promise<void>,
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
  /** Whole speculative lanes that a matching navigation may adopt. */
  _preloads?: Map<string, ActivePreload>
}

type LoaderTask = [
  index: number,
  outcome: Promise<LoaderOutcome>,
  ready: Promise<IndexedOutcome | undefined>,
  candidate?: WorkMatch,
]

type BackgroundLoaderTask = [
  index: number,
  outcome: Promise<LoaderOutcome>,
  ready: Promise<IndexedOutcome | undefined>,
  candidate: WorkMatch,
]

type ExecuteLaneOptions = [
  controller: AbortController,
  redirects: number | undefined,
  isCurrent: () => boolean,
  base: Array<AnyRouteMatch>,
  preload?: boolean,
  sync?: boolean,
  forceStaleReload?: boolean,
  resolvedPrefix?: number,
  onReady?: () => void,
]

type ControlOutcome =
  | [typeof REDIRECTED, redirect: AnyRedirect]
  | [typeof CANCELED]

type LaneResult = ProjectedLane | ControlOutcome

function isControl(
  result: Lane<any> | ControlOutcome,
): result is ControlOutcome {
  return typeof result[0] === 'number'
}

export function waitFor<T>(
  value: T | PromiseLike<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(signal)
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal)
    signal.addEventListener('abort', abort, { once: true })
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
  if (rejected && typeof (value as any)?.then === 'function') {
    value = new Error('A Promise was thrown', { cause: value })
  }
  return rejected ? [ERROR, value] : [SUCCESS, value]
}

function normalizeError(route: AnyRoute, cause: unknown): LoaderOutcome {
  let outcome = normalize(cause, true, route.id)
  if (outcome[0] !== ERROR) {
    return outcome
  }
  try {
    route.options.onError?.(outcome[1])
  } catch (onErrorCause) {
    outcome = normalize(onErrorCause, true, route.id)
  }
  return outcome
}

function normalizeLaneError(
  route: AnyRoute,
  cause: unknown,
  options: ExecuteLaneOptions,
): LoaderOutcome {
  if (options[0].signal.aborted || !options[2]()) {
    options[0].abort()
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
): Promise<IndexedOutcome | undefined> {
  const [location, matches] = lane
  const signal = options[0].signal
  const preload = !!options[4]
  for (let index = options[7] ?? 0; index < matches.length; index++) {
    const match = matches[index]!
    const route = getRoute(router, match)

    match.abortController = options[0]
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
      abortController: options[0],
      preload,
      matches,
      routeId: route.id,
    }
    let context = parentContext
    try {
      let routeContext = match._ctx
      if (!routeContext && route.options.context) {
        const routeContextOptions: RouteContextOptions<
          any,
          any,
          any,
          any,
          any
        > = {
          ...common,
          deps: match.loaderDeps,
          context: parentContext,
        }
        routeContext = match._ctx =
          route.options.context(routeContextOptions) || {}
      }
      context = {
        ...parentContext,
        ...routeContext,
      }
      match.context = context
    } catch (cause) {
      releaseFlight(router, match)
      return [index, normalizeLaneError(route, cause, options)]
    }
    if (signal.aborted || !options[2]()) {
      options[0].abort()
      return [index, [CANCELED]]
    }
    const validationError = match.paramsError ?? match.searchError
    if (validationError !== undefined) {
      releaseFlight(router, match)
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
    options[8]?.()
    try {
      setFetching(router, match, 'beforeLoad', options[0])
      const result = await waitFor(beforeLoad(beforeLoadContext), signal)
      if (!options[2]()) {
        options[0].abort()
        return [index, [CANCELED]]
      }
      const outcome = normalize(result, false, route.id)
      if (outcome[0] !== SUCCESS) {
        releaseFlight(router, match)
        return [index, outcome]
      }
      match.context = {
        ...context,
        ...result,
      }
    } catch (cause) {
      releaseFlight(router, match)
      return [index, normalizeLaneError(route, cause, options)]
    } finally {
      if (previousStatus === 'success' && match.status === 'pending') {
        match.status = 'success'
      }
      setFetching(router, match, false, options[0])
    }
  }

  return
}

function releaseOwnedFlight(
  router: AnyRouter,
  id: string,
  flight?: LoaderFlight,
): AbortController | undefined {
  if (!flight || --flight[2]) {
    return
  }
  if (router._flights?.get(id) === flight) {
    router._flights.delete(id)
  }
  return flight[1]
}

function releaseFlight(router: AnyRouter, match: WorkMatch): void {
  const flight = match._flight
  match._flight = undefined
  releaseOwnedFlight(router, match.id, flight)?.abort()
}
function preloadInputs(
  router: AnyRouter,
  location: ParsedLocation,
): ActivePreload[4] {
  return [
    router.options.context,
    router.options.additionalContext,
    _getUserHistoryState(location.state),
    location.search,
  ]
}

function samePreloadLane(
  preload: ActivePreload,
  router: AnyRouter,
  location: ParsedLocation,
): boolean {
  return (
    preload[3] === router._committed &&
    preload[5] === router.routeTree &&
    deepEqual(preload[4], preloadInputs(router, location)) &&
    !preload[0].some(
      (match) => getRoute(router, match as WorkMatch).options.preload === false,
    )
  )
}

/**
 * Not passing in a `next` ownership recipient
 * is equivalent to discarding the match resources
 */
export function transferMatchResources(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  next?: Array<AnyRouteMatch>,
): void {
  const abort: Array<AbortController> = []
  for (const match of previous as Array<WorkMatch>) {
    if (!next?.includes(match)) {
      const flight = match._flight
      match._flight = undefined
      const controller = releaseOwnedFlight(router, match.id, flight)
      if (controller) {
        abort.push(controller)
      }
    }
  }
  for (const controller of abort) {
    controller.abort()
  }
}

function discardPreload(router: AnyRouter, preload: ActivePreload): void {
  preload[1].abort()
  transferMatchResources(router, preload[0])
}

function acquireMatchResources(matches: Array<AnyRouteMatch>): void {
  for (const match of matches as Array<WorkMatch>) {
    const flight = match._flight
    if (flight) {
      flight[2]++
    }
  }
}

function setFetching(
  router: AnyRouter,
  match: WorkMatch,
  value: AnyRouteMatch['isFetching'],
  owner?: AbortController,
): void {
  match.isFetching = value
  if (owner && router._tx?.[0] !== owner) {
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
  const location = lane[0]
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
  loader: RouteLoaderFn<any> | undefined,
  parentMatchPromise: Promise<WorkMatch> | undefined,
  preload: boolean,
  owner: AbortController,
): Promise<LoaderOutcome> {
  const signal = owner.signal
  if (signal.aborted) {
    return [CANCELED]
  }
  if (!loader) {
    return [SUCCESS, undefined]
  }

  let flight = match._flight
  let joined = !!flight
  setFetching(router, match, 'loader', owner)
  try {
    for (;;) {
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
            (value) => normalize(value, false, route.id),
            (cause) => normalize(cause, true, route.id),
          )
          .then((result): LoaderOutcome => {
            return result[0] === ERROR && match._flight === flight
              ? normalizeError(route, result[1])
              : result
          })
        flight = [outcome, controller, 1]
        ;(router._flights ??= new Map()).set(match.id, flight)
      }
      match._flight = flight
      match.abortController = flight[1]
      try {
        const outcome = await waitFor(flight[0], signal)
        if (!joined || outcome[0] === SUCCESS || outcome[0] === REDIRECTED) {
          return outcome
        }
      } catch (cause) {
        if (cause === signal) {
          releaseFlight(router, match)
          return [CANCELED]
        }
        throw cause
      }
      releaseFlight(router, match)
      if (signal.aborted) {
        return [CANCELED]
      }
      flight = undefined
      joined = false
    }
  } finally {
    setFetching(router, match, false, owner)
  }
}

function settleInto(
  match: WorkMatch,
  result: LoaderOutcome,
  preload: boolean,
): void {
  if (result[0] === SUCCESS) {
    match.loaderData = result[1]
    match.error = undefined
    match.status = 'success'
    match.invalid = false
    match.updatedAt = Date.now()
    match.preload = preload
  } else if (result[0] !== REDIRECTED) {
    // Reduction installs only the selected terminal failure. Every other
    // settled attempt remains a renderable, stale match in that lane.
    match.status = 'success'
    match.error = undefined
    match.invalid = true
  }
}

export function cacheLoaderMatch(
  router: CoordinatorRouter,
  match: WorkMatch,
  planned: AnyRouteMatch | undefined,
): void {
  const current = router._cache.get(match.id) as WorkMatch | undefined
  if (
    current !== planned ||
    router._committed.some(
      (candidate) =>
        candidate.id === match.id &&
        (candidate as WorkMatch)._flight === match._flight,
    )
  ) {
    return
  }
  const cached = {
    ...match,
    _notFound: undefined,
    context: {},
  } as WorkMatch
  if (cached._flight) {
    cached._flight[2]++
  }
  router._cache.set(match.id, cached)
  if (current) {
    releaseFlight(router, current)
  }
}

function getParentSnapshot(
  match: WorkMatch,
  outcome: LoaderOutcome,
): WorkMatch {
  if (outcome[0] === ERROR || outcome[0] === NOT_FOUND) {
    return {
      ...match,
      status: outcome[0] === ERROR ? 'error' : 'notFound',
      error: outcome[1],
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
  const match = lane[1][index]!
  const route = getRoute(router, match)
  const preload = !!options[4]
  const plannedCacheMatch = preload ? router._cache.get(match.id) : undefined
  let reload = false
  let reloadFailure: LoaderOutcome | undefined
  try {
    let configured
    if (match.status === 'success') {
      configured = route.options.shouldReload
      if (typeof configured === 'function') {
        configured = configured(
          getLoaderContext(
            router,
            lane,
            match,
            route,
            options[0],
            semanticParent,
            preload,
          ),
        )
      }
      if (!options[2]()) {
        options[0].abort()
        reloadFailure = [CANCELED]
      }
    }
    if (!reloadFailure) {
      if (match.status !== 'success') {
        reload = true
      } else {
        const staleAge =
          options[4] || match.preload
            ? (route.options.preloadStaleTime ??
              router.options.defaultPreloadStaleTime ??
              30_000)
            : (route.options.staleTime ?? router.options.defaultStaleTime ?? 0)
        reload = !!(
          match.invalid ||
          configured ||
          (configured === undefined &&
            Date.now() - match.updatedAt >= staleAge &&
            (options[6] ||
              match.cause === 'enter' ||
              options[3].some(
                (candidate) =>
                  candidate.routeId === match.routeId &&
                  candidate.id !== match.id,
              )))
        )
      }
    }
  } catch (cause) {
    match.invalid = true
    releaseFlight(router, match)
    reloadFailure = normalizeLaneError(route, cause, options)
  }
  const routeLoader = route.options.loader
  const loader =
    typeof routeLoader === 'function' ? routeLoader : routeLoader?.handler
  const background = !!(
    routeLoader &&
    reload &&
    match.status === 'success' &&
    !preload &&
    !options[5] &&
    ((typeof routeLoader === 'function'
      ? undefined
      : routeLoader?.staleReloadMode) ??
      router.options.defaultStaleReloadMode) !== 'blocking'
  )
  const loaded = reload && (!preload || route.options.preload !== false)
  const blocking =
    loaded && !background && (match.status !== 'success' || !!routeLoader)
  if (loaded && !routeLoader) {
    match.invalid = false
    match.updatedAt = Date.now()
  }
  let donor = loaded && routeLoader ? router._flights?.get(match.id) : undefined
  if (donor === match._flight) {
    donor = undefined
  } else if (donor) {
    donor[2]++
  }
  if (blocking) {
    const acceptedFlight = match._flight
    match._flight = donor
    releaseOwnedFlight(router, match.id, acceptedFlight)?.abort()
    // A successful route without a loader has no blocking work to present. It
    // still gets a task so its chunk and derived assets participate in the
    // lane, but putting it back into pending would hide an already-rendered
    // ancestor while only a descendant is loading.
    if (match.status === 'success') {
      match.status = 'pending'
    }
    options[8]?.()
  }
  if (!loaded) {
    match.isFetching = false
  }
  const rawOutcome = reloadFailure
    ? Promise.resolve(reloadFailure)
    : !blocking
      ? Promise.resolve<LoaderOutcome>([SUCCESS, match.loaderData])
      : loadResource(
          router,
          lane,
          match,
          route,
          loader,
          semanticParent,
          preload,
          options[0],
        )
  const outcome = rawOutcome.then((result) => {
    if (blocking) {
      settleInto(match, result, preload)
      if (result[0] === SUCCESS) {
        if (preload && routeLoader) {
          cacheLoaderMatch(router, match, plannedCacheMatch)
        }
        // A route is renderable only after both its data and normal component
        // chunk are ready. Its loader data is already available to descendants.
        match.status = 'pending'
      }
    }
    return result
  })

  const chunkFailure = waitFor(
    Promise.resolve().then(() => loadRouteChunk(route)),
    options[0].signal,
  )
    .then(
      () => {
        options[8]?.()
        return undefined
      },
      (cause): IndexedOutcome => [
        index,
        normalizeLaneError(route, cause, options),
      ],
    )
    .then(async (failure) => {
      const result = await outcome
      if (
        blocking &&
        !failure &&
        result[0] === SUCCESS &&
        match.status === 'pending' &&
        options[2]()
      ) {
        match.status = 'success'
        options[8]?.()
      }
      return failure
    })
  tasks.push([index, outcome, chunkFailure])
  if (!background) {
    return outcome.then((result) => getParentSnapshot(match, result))
  }
  const candidate: WorkMatch = {
    ...match,
    status: 'pending',
    preload: false,
    _flight: donor,
  }
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
    options[0],
  ).then((result) => {
    match.isFetching = false
    settleInto(candidate, result, false)
    return result
  })
  ;(lane[2] ??= []).push([index, backgroundOutcome, chunkFailure, candidate])
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
): Promise<number> {
  const cause = indexed?.[1][1] as NotFoundError | undefined
  let index = cause?.routeId
    ? matches.findIndex((match) => match.routeId === cause.routeId)
    : (indexed?.[0] ?? matches.length - 1)
  if (index < 0) {
    index = 0
  }
  for (let i = index; i >= 0; i--) {
    const route = getRoute(router, matches[i]!)
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
    if (route.options.notFoundComponent) {
      return i
    }
  }
  return cause?.routeId ? index : fallback
}

function discardBackground(router: AnyRouter, lane: Lane<any>): void {
  if (lane[2]) {
    transferMatchResources(
      router,
      lane[2].map((task) => task[3]),
    )
    lane[2] = undefined
  }
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
        task[1].then(async (outcome) => {
          const taskIndex = task[0]
          if (gate && taskIndex >= (await gate)) {
            return
          }
          if (outcome[0] >= REDIRECTED) {
            throw [taskIndex, outcome] as IndexedOutcome
          }
          if (!loaderFailure && outcome[0] !== SUCCESS) {
            loaderFailure = [taskIndex, outcome]
            // Every started descendant must settle before an ordinary failure
            // wins because a redirect from any of them remains control flow.
            await Promise.all(
              (redirectTasks ?? []).map((nextTask) => {
                if (nextTask[0] <= taskIndex) {
                  return
                }
                return nextTask[1].then((nextOutcome) => {
                  if (nextOutcome[0] === REDIRECTED) {
                    throw [nextTask[0], nextOutcome] as IndexedOutcome
                  }
                })
              }),
            )
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
  redirects: number | undefined,
  settlement: Promise<IndexedOutcome | undefined>,
  onReady?: () => void,
): Promise<ReducedLane | ControlOutcome> {
  const matches = lane[1]
  const settled = await settlement
  let control = (settled?.[1][0] ?? 0) >= REDIRECTED ? settled : undefined
  let failure = control ? undefined : settled
  const plannedBoundary = matches.findIndex((match) => match._notFound)
  const boundaryOf = (found: IndexedOutcome) =>
    found[1][0] === NOT_FOUND
      ? getNotFoundBoundary(router, matches, found, controller.signal)
      : found[0]

  if (!control) {
    const readinessEnd = failure
      ? await boundaryOf(failure)
      : plannedBoundary < 0
        ? matches.length
        : plannedBoundary
    for (const task of tasks) {
      if (task[0] >= readinessEnd) {
        break
      }
      const chunkFailure = await task[2]
      if (chunkFailure) {
        if (chunkFailure[1][0] >= REDIRECTED) {
          control = chunkFailure
        } else {
          failure ??= chunkFailure
        }
        break
      }
    }
  }

  if (
    control?.[1][0] === REDIRECTED &&
    !control[1][1].options.reloadDocument &&
    (redirects ?? 0) >= 20
  ) {
    failure = [control[0], [ERROR, new Error('Redirect cycle detected')]]
    control = undefined
  }

  if (control) {
    discardBackground(router, lane)
    return control[1] as ControlOutcome
  }

  if (failure) {
    const [, outcome] = failure
    const kind = outcome[0]
    const boundary = await boundaryOf(failure)
    const match = matches[boundary]!
    const cause = outcome[1]
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
    try {
      await waitFor(
        Promise.resolve().then(() =>
          loadRouteChunk(
            getRoute(router, match),
            kind === ERROR ? 'errorComponent' : 'notFoundComponent',
          ),
        ),
        controller.signal,
      )
    } catch (cause) {
      if (cause === controller.signal) {
        discardBackground(router, lane)
        return [CANCELED]
      }
    }
  } else if (plannedBoundary >= 0) {
    const match = matches[plannedBoundary]!
    try {
      await waitFor(
        Promise.all([
          loadRouteChunk(getRoute(router, match)),
          loadRouteChunk(getRoute(router, match), 'notFoundComponent'),
        ]),
        controller.signal,
      )
    } catch (cause) {
      if (cause === controller.signal) {
        discardBackground(router, lane)
        return [CANCELED]
      }
    }
    match.status = 'success'
    onReady?.()
  }

  return lane as ReducedLane
}

export async function projectLane(
  router: AnyRouter,
  lane: ReducedLane,
  signal: AbortSignal,
  start = 0,
  end = lane[1].length,
): Promise<ProjectedLane> {
  const matches = lane[1]
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
  return lane as ProjectedLane
}

async function executeClientLane(
  router: AnyRouter,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  options: ExecuteLaneOptions,
): Promise<LaneResult> {
  const matched = [location, matches as Array<WorkMatch>] as MatchedLane
  const plannedBoundary = matches.findIndex((match) => match._notFound)
  if (router.options.notFoundMode !== 'root' && plannedBoundary >= 0) {
    const boundary = await getNotFoundBoundary(
      router,
      matched[1],
      undefined,
      options[0].signal,
      plannedBoundary,
    )
    if (boundary !== plannedBoundary) {
      matches[plannedBoundary]!._notFound = undefined
      matches[boundary]!._notFound = true
    }
  }
  const failure = await contextualize(router, matched, options)
  if (failure) {
    options[5] = true
  }
  const contextualized = matched as ContextualizedLane
  const contextualizedMatches = contextualized[1]
  const tasks: Array<LoaderTask> = []
  const start = options[7] ?? 0
  let semanticParent = start
    ? Promise.resolve(contextualizedMatches[start - 1]!)
    : undefined
  let end = failure?.[0] ?? contextualizedMatches.length
  if (failure?.[1][0] === NOT_FOUND) {
    end = Math.min(
      end,
      (await getNotFoundBoundary(
        router,
        contextualizedMatches,
        failure,
        options[0].signal,
      )) + 1,
    )
  } else if ((failure?.[1][0] ?? 0) >= REDIRECTED) {
    end = 0
  }
  for (let index = start; index < end; index++) {
    if (options[0].signal.aborted) {
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
  let reduced: ReducedLane | ControlOutcome
  try {
    const reduction = reduceLane(
      router,
      contextualized,
      tasks,
      options[0],
      options[1],
      settleTasks(tasks, failure, contextualized[2]),
      options[8],
    )
    if (contextualized[2]?.length) {
      contextualized[3] = settleTasks(
        contextualized[2],
        undefined,
        undefined,
        reduction.then(
          (foreground) =>
            isControl(foreground)
              ? 0
              : _getRenderedMatches(foreground[1]).length,
          () => 0,
        ),
      )
    }
    reduced = await reduction
  } catch (cause) {
    discardBackground(router, contextualized)
    throw cause
  }
  if (isControl(reduced)) {
    return reduced
  }
  return projectLane(
    router,
    reduced,
    options[0].signal,
    options[7] === reduced[1].length ? options[7] : 0,
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
):
  | [delay: number, boundary: number, min: number, component: unknown]
  | undefined
  | void {
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
    const component =
      route.options.pendingComponent ??
      (router.options as any).defaultPendingComponent
    return component && typeof delay === 'number' && delay !== Infinity
      ? [
          delay,
          index,
          route.options.pendingMinMs ?? router.options.defaultPendingMinMs ?? 0,
          component,
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
  let tookOver = false
  const sessionMatchId = session?.[0][3][session[1]]?.id
  if (session?.[0] !== tx) {
    if (session && tx[3][session[1]]?.id === sessionMatchId) {
      session[0] = tx
      tookOver = true
    } else {
      clearTimeout(session?.[3])
      router._pending = session = undefined
    }
  }
  const config = pendingConfig(router, tx[3])
  if (!config) {
    return
  }
  const [delay, boundary, min, component] = config
  const matchId = tx[3][boundary]!.id
  if (!session || session[1] !== boundary || sessionMatchId !== matchId) {
    // Hydration and redirects can preserve pending presentation without a session.
    // Do not delay it again; conservatively start pendingMinMs from now.
    clearTimeout(session?.[3])
    const presented = router.stores.matches.get()[boundary]
    const visible = presented?.id === matchId && presented.status === 'pending'
    router._pending = session = [
      tx,
      boundary,
      visible ? Date.now() + min : tx[4] + delay,
      undefined,
      visible ? Promise.resolve(true) : undefined,
      component,
    ]
  }
  if (session[4] && !tookOver && session[5] === component) {
    return
  }
  session[5] = component
  if (!session[4]) {
    clearTimeout(session[3])
    const remaining = session[2] - Date.now()
    if (remaining > 0) {
      session[3] = setTimeout(() => {
        offerPending(router, tx)
      }, remaining)
      return
    }
    session[2] = 0
  }
  const offered = tx[3].map((match) => ({
    ...match,
    _flight: undefined,
  }))
  offered[boundary]!.status = 'pending'
  const ack = router
    .startTransition(() => router.stores.setMatches(offered), offered, true)
    .then((rendered) => {
      if (
        rendered &&
        router._pending === session &&
        session[4] === ack &&
        !session[2]
      ) {
        session[2] = Date.now() + min
      }
      return rendered
    })
  session[4] = ack
}

/**
 * Cancels pending UI timing when its load ends. The ownership check prevents
 * an older, superseded load from clearing pending UI that a newer load took over.
 */
function finishPending(router: CoordinatorRouter, tx: LoadTransaction): void {
  const session = router._pending
  if (session?.[0] === tx) {
    clearTimeout(session[3])
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

function discardLane(router: AnyRouter, lane: ProjectedLane): void {
  transferMatchResources(router, lane[1])
  discardBackground(router, lane)
}

function commitMatches(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  matches: Array<AnyRouteMatch>,
): void {
  const previous = router._committed
  const previousCached = router._cache
  for (const match of matches) {
    match.preload = false
  }
  const rendered = _getRenderedMatches(matches)
  const cached = new Map<string, AnyRouteMatch>()
  const now = Date.now()
  for (const match of [...previous, ...previousCached.values()]) {
    if (
      rendered.some((candidate) => candidate.id === match.id) ||
      match.status !== 'success'
    ) {
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
      continue
    }
    cached.set(
      match.id,
      previousCached.get(match.id) === match
        ? match
        : ({
            ...match,
            _flight: undefined,
            isFetching: false,
            context: {},
          } as WorkMatch),
    )
  }
  // The lane becomes committed before publication can synchronously reenter.
  tx[3] = []
  router._cache = cached
  publishMatches(router, matches)
  transferMatchResources(
    router,
    [...previousCached.values(), ...previous],
    [...matches, ...cached.values()],
  )
  runRouteLifecycle(router, previous, matches, () => router._tx === tx)
}

async function awaitCurrent(
  router: CoordinatorRouter,
  owner?: LoadTransaction,
): Promise<void> {
  let current = router._tx
  while (current && current !== owner) {
    await current[5]
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
    _redirects: (tx[1] ?? 0) + 1,
  } as any)
}

function restoreCommitted(
  router: CoordinatorRouter,
  tx: LoadTransaction,
): void {
  finishPending(router, tx)
  tx[0].abort()
  transferMatchResources(router, tx[3])
  tx[3] = []
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
  const next = base.map((match) => ({ ...match }))
  acquireMatchResources(next)
  for (const task of tasks) {
    releaseFlight(router, next[task[0]]!)
    next[task[0]] = task[3]
  }
  const lane = [tx[2], next] as ContextualizedLane
  let reduced: ReducedLane | ControlOutcome
  try {
    reduced = await reduceLane(router, lane, tasks, tx[0], tx[1], settlement)
  } catch (cause) {
    transferMatchResources(router, next)
    throw cause
  }
  if (isControl(reduced)) {
    transferMatchResources(router, next)
    if (
      reduced[0] === REDIRECTED &&
      router._tx === tx &&
      router._committed === base
    ) {
      await followRedirect(router, tx, reduced[1])
    }
    return
  }
  const projected = await projectLane(router, reduced, tx[0].signal)
  if (router._tx !== tx || router._committed !== base) {
    transferMatchResources(router, projected[1])
    return
  }
  for (const match of projected[1] as Array<WorkMatch>) {
    const cached = router._cache.get(match.id) as WorkMatch | undefined
    if (cached?._flight && cached._flight === match._flight) {
      router._cache.delete(match.id)
      releaseFlight(router, cached)
    }
  }
  publishMatches(router, projected[1])
  transferMatchResources(router, base, projected[1])
}

async function runClientTransaction(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  forceStaleReload: boolean,
  onReady?: () => void,
  sync?: boolean,
  resolvedPrefix?: number,
  adopted?: ActivePreload,
  retained?: ActivePreload,
): Promise<void> {
  const options: ExecuteLaneOptions = [
    tx[0],
    tx[1],
    () => router._tx === tx && !!tx[3].length,
    router._committed,
    undefined,
    sync,
    forceStaleReload,
    resolvedPrefix,
    onReady,
  ]
  let result: LaneResult
  try {
    result = adopted
      ? await adopted[2]
      : await executeClientLane(router, tx[2], tx[3], options)
  } finally {
    if (retained) {
      discardPreload(router, retained)
    }
  }
  if (
    adopted &&
    router._tx === tx &&
    ((isControl(result) && result[0] === CANCELED) ||
      (!isControl(result) &&
        result[1].some(
          (match) => match.status !== 'success' || match._notFound,
        )))
  ) {
    // Successful loaders already seeded the cache; retry only the guard lane.
    const donors = tx[3] as Array<WorkMatch>
    tx[3] = []
    transferMatchResources(router, donors)
    tx[0].abort()
    if (router._tx !== tx) {
      return
    }
    const controller = new AbortController()
    tx[0] = options[0] = controller
    tx[3] = router.matchRoutes(tx[2], {
      _controller: controller,
    })
    acquireMatchResources(tx[3])
    result = await executeClientLane(router, tx[2], tx[3], options)
  }

  if (isControl(result)) {
    if (result[0] === REDIRECTED && router._tx === tx) {
      finishPending(router, tx)
      transferMatchResources(router, tx[3])
      tx[3] = []
      if (router._tx === tx) {
        await followRedirect(router, tx, result[1])
      }
    } else {
      restoreCommitted(router, tx)
    }
    return
  }
  const pending = router._pending
  if (pending?.[0] === tx) {
    /**
     * Loading finished, so cancel any pending reveal. If the fallback rendered,
     * wait out the rest of `pendingMinMs` before replacing it. If it never
     * rendered, there is no minimum wait; if another load took it over, that
     * load owns the deadline.
     */
    clearTimeout(pending[3])
    if (pending[4]) {
      const signal = tx[0].signal
      let rendered = false
      try {
        rendered = await waitFor(pending[4], signal)
      } catch (cause) {
        if (cause !== signal) {
          throw cause
        }
      }
      if (rendered && router._pending === pending && pending[0] === tx) {
        const remaining = pending[2] - Date.now()
        if (remaining > 0) {
          try {
            await waitFor(
              new Promise<void>((resolve) => {
                pending[3] = setTimeout(resolve, remaining)
              }),
              signal,
            )
          } catch {}
          clearTimeout(pending[3])
        }
      }
    }
  }
  if (router._tx !== tx) {
    finishPending(router, tx)
    discardLane(router, result)
    return
  }
  const toLocation = tx[2]
  const changeInfo = getLocationChangeInfo(
    toLocation,
    router.stores.resolvedLocation.get(),
  )
  const background = result[2]
  await router.startViewTransition(async () => {
    if (router._tx !== tx) {
      discardLane(router, result)
      return
    }
    const commit = () => {
      finishPending(router, tx)
      commitMatches(router, tx, result[1])
      if (router._tx !== tx) {
        return
      }
      router.emit({ type: 'onLoad', ...changeInfo })
      if (router._tx === tx) {
        router.emit({ type: 'onBeforeRouteMount', ...changeInfo })
      }
    }
    const rendered = await router.startTransition(commit, result[1])
    if (router._tx !== tx) {
      discardBackground(router, result)
      return
    }
    if (background?.length) {
      // Publish refreshes only after the foreground render acknowledgement.
      // Otherwise a fast refresh can replace the acknowledged generation
      // before the framework commits it and strand the navigation.
      runBackground(router, tx, result[1], background, result[3]!).catch(
        console.error,
      )
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
  opts?: { sync?: boolean },
): Promise<void> {
  const previousOwner = router._tx
  const resolvedLocation = router.stores.resolvedLocation.get()
  const previousLocation = resolvedLocation ?? router.stores.location.get()
  const location = router.latestLocation
  const pendingLocation = router._pendingLocation as
    | (ParsedLocation & { _redirects?: number })
    | undefined
  const redirects =
    pendingLocation?.href === location.href
      ? pendingLocation._redirects
      : undefined
  const handoff = router._handoff
  const hydrationController = handoff?.[0]()
  const preflight = new AbortController()
  const previousPreflight = router._preflight
  router._preflight = preflight
  if (!hydrationController) {
    handoff?.[1]()
  }
  previousPreflight?.abort()
  if (preflight.signal.aborted || router._tx !== previousOwner) {
    await awaitCurrent(router, previousOwner)
    return
  }

  const changeInfo = getLocationChangeInfo(location, resolvedLocation)
  router.emit({ type: 'onBeforeNavigate', ...changeInfo })
  if (!preflight.signal.aborted && router._tx === previousOwner) {
    router.emit({ type: 'onBeforeLoad', ...changeInfo })
  }
  if (preflight.signal.aborted || router._tx !== previousOwner) {
    preflight.abort()
    await awaitCurrent(router, previousOwner)
    return
  }
  const sameHref = previousLocation.href === location.href
  let adopted = router._preloads?.get(location.href)
  let retained: ActivePreload | undefined
  if (
    adopted &&
    (hydrationController || !samePreloadLane(adopted, router, location))
  ) {
    router._preloads!.delete(location.href)
    // Keep incompatible loader flights alive through the real lane's reload
    // decisions so matching generations can still donate their work.
    retained = adopted
    adopted = undefined
  }
  let matches: Array<AnyRouteMatch>
  let controller = preflight
  let resolvedPrefix: number | undefined
  if (adopted) {
    controller = adopted[1]
    matches = adopted[0]
    router._preloads!.delete(location.href)
  } else {
    try {
      matches = router.matchRoutes(location, { _controller: preflight })
      acquireMatchResources(matches)
    } catch (cause) {
      preflight.abort()
      if (retained) {
        discardPreload(router, retained)
      }
      if (!isRedirect(cause)) {
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
    resolvedPrefix = hydrationController ? handoff![1](matches) : undefined
    if (resolvedPrefix) {
      controller = hydrationController!
    } else {
      hydrationController?.abort()
    }
  }
  if (router._preflight !== preflight || router._tx !== previousOwner) {
    preflight.abort()
    transferMatchResources(router, matches)
    await awaitCurrent(router, previousOwner)
    return
  }
  router._preflight = undefined

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
          adopted,
          retained,
        ),
      )
      .catch(() => {
        if (router._tx === tx) {
          restoreCommitted(router, tx)
        }
      }),
  ]
  router._tx = tx
  if (router._handoff === handoff) {
    router._handoff = undefined
  }
  if (previousOwner) {
    for (const match of router.stores.matches.get() as Array<WorkMatch>) {
      if (router._tx !== tx) {
        break
      }
      if (match.isFetching) {
        setFetching(router, match, false)
      }
    }
    previousOwner[0].abort()
    transferMatchResources(router, previousOwner[3])
  }
  if (router._tx !== tx) {
    transferMatchResources(router, tx[3])
    tx[3] = []
    await awaitCurrent(router, tx)
    return
  }

  router.batch(() => {
    router.stores.status.set('pending')
    router.stores.location.set(location)
  })
  offerPending(router, tx)
  try {
    await tx[5]
  } finally {
    await awaitCurrent(router, tx)
  }
}

export function refreshClientRoute(router: CoordinatorRouter): Promise<void> {
  if (router._flights) {
    const flights = [...router._flights.values()]
    router._flights.clear()
    for (const flight of flights) {
      flight[1].abort()
    }
  }
  const committed = router._committed
  router._committed = []
  router.clearCache()
  transferMatchResources(router, committed)

  return router.load({ sync: true })
}

function followPreloadRedirect(
  router: CoordinatorRouter,
  result: ControlOutcome,
  location: ParsedLocation,
  owner: LoadTransaction | undefined,
  redirects: number,
): Promise<Array<AnyRouteMatch> | undefined> | undefined {
  if (
    result[0] === REDIRECTED &&
    !result[1].options.reloadDocument &&
    router._tx === owner
  ) {
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

export async function preloadClientRoute(
  router: CoordinatorRouter,
  opts: any,
  redirects = 0,
): Promise<Array<AnyRouteMatch> | undefined> {
  if (redirects >= 20) {
    return
  }
  const owner = router._tx
  const location = opts._builtLocation ?? router.buildLocation(opts)
  const base = router._committed
  const controller = new AbortController()
  let matches: Array<AnyRouteMatch> | undefined
  let preload: ActivePreload | undefined
  let replaced: ActivePreload | undefined
  try {
    const pending = router._preloads?.get(location.href)
    if (pending) {
      if (samePreloadLane(pending, router, location)) {
        const result = await pending[2]
        return isControl(result)
          ? followPreloadRedirect(router, result, location, owner, redirects)
          : result[1]
      }
      router._preloads!.delete(location.href)
      // Keep the superseded lane alive until this lane has made its reload
      // decisions. Its active flights are the synchronous donor authority.
      replaced = pending
    }
    matches = router.matchRoutes(location, {
      _controller: controller,
    })
    acquireMatchResources(matches)
    const promise = Promise.resolve()
      .then(() =>
        executeClientLane(router, location, matches!, [
          controller,
          redirects,
          () => router._tx === owner || router._tx?.[0] === controller,
          base,
          true,
        ]),
      )
      .finally(() => {
        if (replaced) {
          discardPreload(router, replaced)
        }
      })
    preload = [
      matches,
      controller,
      promise,
      base,
      preloadInputs(router, location),
      router.routeTree,
    ]
    ;(router._preloads ??= new Map()).set(location.href, preload)
    const result = await promise
    if (router._preloads?.get(location.href) !== preload) {
      return isControl(result) ? undefined : result[1]
    }
    router._preloads.delete(location.href)
    if (isControl(result)) {
      controller.abort()
      transferMatchResources(router, matches)
      return followPreloadRedirect(router, result, location, owner, redirects)
    }

    transferMatchResources(router, result[1])
    controller.abort()
    return result[1]
  } catch (cause) {
    if (!preload || router._preloads?.get(location.href) === preload) {
      if (preload) {
        router._preloads!.delete(location.href)
      }
      controller.abort()
      if (matches) {
        transferMatchResources(router, matches)
      }
    }
    if (router._tx !== owner) {
      return
    }
    if (!isNotFound(cause)) {
      console.error(cause)
    }
    return
  }
}
