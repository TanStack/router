// Keep this filename free of a secondary extension so declaration generation
// can rewrite relative imports for both ESM and CJS.
import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import { loadRouteChunk } from './route-chunks'
import { getLocationChangeInfo } from './router'
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

type Phase = 'matched' | 'contextualized' | 'reduced' | 'projected'

type Lane<TPhase extends Phase> = {
  readonly [lanePhase]?: TPhase
  location: ParsedLocation
  matches: Array<WorkMatch>
  background?: Array<BackgroundTask>
}

type MatchedLane = Lane<'matched'>

type ContextualizedLane = Lane<'contextualized'>

type ReducedLane = Lane<'reduced'>

export type ProjectedLane = Lane<'projected'>

const success = 0
const error = 1
const notFound = 2
const redirected = 3
const canceled = 4

type LoaderOutcome =
  | [typeof success, data: unknown]
  | [typeof error, error: unknown]
  | [typeof notFound, error: NotFoundError]
  | [typeof redirected, redirect: AnyRedirect]
  | [typeof canceled]

type IndexedOutcome = [index: number, outcome: LoaderOutcome]

export type LoaderFlight = [
  outcome: Promise<LoaderOutcome>,
  controller: AbortController,
  leases: number,
]

type WorkMatch = AnyRouteMatch & {
  _flight?: LoaderFlight
  _preloadContext?: number
  _preloadBeforeLoad?: AnyRoute['options']['beforeLoad']
}

type ClientRouter = AnyRouter & {
  _flights?: Map<string, LoaderFlight>
}

export type LoadTransaction = {
  location: ParsedLocation
  controller: AbortController
  matches: Array<AnyRouteMatch>
  done: Promise<void>
  redirects?: number
  redirecting?: true
}

export type PendingSession = {
  owner: LoadTransaction
  boundary: number
  /** Pending reveal time until acknowledged, then minimum-visible-until time. */
  deadline: number
  timer?: ReturnType<typeof setTimeout>
  ack?: Promise<boolean>
}

type CoordinatorRouter = ClientRouter & {
  _tx?: LoadTransaction
  _committedMatches?: Array<AnyRouteMatch>
  _pending?: PendingSession
  /** Cancels reentrant synchronous planning without replacing the current writer. */
  _preflight?: AbortController
}

type WorkerRouter = Pick<
  AnyRouter,
  'buildLocation' | 'navigate' | 'options' | 'routeTree' | 'routesById'
>

type Task = {
  outcome: Promise<LoaderOutcome>
  ready: Promise<IndexedOutcome | undefined>
  match?: Promise<WorkMatch>
}

type BackgroundTask = Task & {
  index: number
  candidate: WorkMatch
}

export type ExecuteLaneOptions = {
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
  | [typeof redirected, redirect: AnyRedirect]
  | [typeof canceled]

export type LaneResult = ProjectedLane | ControlOutcome

function waitFor<T>(
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

function getRoute(router: WorkerRouter, match: WorkMatch): AnyRoute {
  return (router.routesById as Record<string, AnyRoute>)[match.routeId]!
}

function normalize(
  value: unknown,
  rejected: boolean,
  routeId?: string,
): LoaderOutcome {
  if (isRedirect(value)) {
    return [redirected, value]
  }
  if (isNotFound(value)) {
    value.routeId ||= routeId
    return [notFound, value]
  }
  return rejected ? [error, value] : [success, value]
}

function normalizeError(
  route: AnyRoute,
  cause: unknown,
  signal?: AbortSignal,
): LoaderOutcome {
  if (signal && (cause as any)?.name === 'AbortError') {
    return signal.aborted ? [canceled] : [success, undefined]
  }
  let outcome = normalize(cause, true, route.id)
  if (outcome[0] !== error) {
    return outcome
  }
  try {
    route.options.onError?.(cause)
  } catch (onErrorCause) {
    outcome = normalize(onErrorCause, true, route.id)
  }
  return outcome
}

function navigateFrom(router: WorkerRouter, location: ParsedLocation) {
  return (opts: any) =>
    router.navigate({
      ...opts,
      _fromLocation: location,
    })
}

async function contextualize(
  router: WorkerRouter,
  lane: MatchedLane,
  options: ExecuteLaneOptions,
): Promise<IndexedOutcome | undefined> {
  let reusePreloadContext = !options.preload
  for (
    let index = options.resolvedPrefix ?? 0;
    index < lane.matches.length;
    index++
  ) {
    const match = lane.matches[index]!
    const route = getRoute(router, match)
    const serialError = match.paramsError ?? match.searchError

    if (serialError !== undefined) {
      releaseFlight(router as ClientRouter, match)
      return [index, normalizeError(route, serialError)]
    }

    // Fresh matches already own this lane's controller; cached matches do not.
    reusePreloadContext &&= match.abortController !== options.controller
    match.abortController = options.controller
    // Contextualization is serial, so the previous match already contains the
    // complete parent context for this route.
    const parentContext =
      lane.matches[index - 1]?.context ?? router.options.context ?? {}
    const context = {
      ...parentContext,
      ...match.__routeContext,
    }

    const beforeLoad = route.options.beforeLoad
    if (!beforeLoad) {
      match.__beforeLoadContext = {}
      match.context = context
      continue
    }

    const preload = !!options.preload
    // A child can only reuse context from the same parent generation.
    const donor = match._preloadContext
    const reuse =
      reusePreloadContext &&
      donor != null &&
      !shouldReloadMatch(router, match, route, options, undefined, donor)
    match._preloadContext = undefined
    if (process.env.NODE_ENV !== 'production') {
      match._preloadBeforeLoad = undefined
    }
    if (reuse) {
      match.context = {
        ...context,
        ...match.__beforeLoadContext,
      }
      continue
    }
    reusePreloadContext = false

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
      const result = await waitFor(
        beforeLoad(beforeLoadContext),
        options.controller.signal,
      )
      match.isFetching = false
      const outcome = normalize(result, false, route.id)
      if (outcome[0] !== success) {
        releaseFlight(router as ClientRouter, match)
        return [index, outcome]
      }
      match.__beforeLoadContext = result
      match.context = {
        ...context,
        ...result,
      }
      if (preload && route.options.preload !== false) {
        match._preloadContext = Date.now()
        if (process.env.NODE_ENV !== 'production') {
          match._preloadBeforeLoad = beforeLoad
        }
      }
    } catch (cause) {
      match.isFetching = false
      if (cause === options.controller.signal) {
        return [index, [canceled]]
      }
      if (cause instanceof Promise) {
        throw cause
      }
      releaseFlight(router as ClientRouter, match)
      return [index, normalizeError(route, cause)]
    }
  }

  return
}

function releaseFlight(router: ClientRouter, match: WorkMatch): void {
  const flight = match._flight
  if (!flight) {
    return
  }
  match._flight = undefined
  if (!--flight[2]) {
    flight[1].abort()
    if (router._flights?.get(match.id) === flight) {
      router._flights.delete(match.id)
    }
  }
}

export function discardMatchResources(
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
): void {
  transferMatchResources(router, matches, [])
}

export function transferMatchResources(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  next: Array<AnyRouteMatch>,
): void {
  for (const match of previous as Array<WorkMatch>) {
    if (!next.includes(match)) {
      releaseFlight(router as ClientRouter, match)
    }
  }
}

function startFlight(
  router: ClientRouter,
  key: string,
  route: AnyRoute,
  invoke: (controller: AbortController) => unknown,
): LoaderFlight {
  const controller = new AbortController()
  const flight: LoaderFlight = [
    Promise.resolve()
      .then(() => invoke(controller))
      .then(
        (value) =>
          controller.signal.aborted
            ? [canceled]
            : normalize(value, false, route.id),
        (cause) =>
          controller.signal.aborted
            ? [canceled]
            : normalizeError(route, cause, controller.signal),
      ),
    controller,
    1,
  ]
  ;(router._flights ??= new Map()).set(key, flight)
  return flight
}

function closeFlight(router: ClientRouter, match: WorkMatch): void {
  const flight = match._flight
  if (!flight) {
    return
  }
  if (router._flights?.get(match.id) === flight) {
    router._flights.delete(match.id)
  }
}

function getLoaderContext(
  router: WorkerRouter,
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
  router: ClientRouter,
  workerRouter: WorkerRouter,
  lane: ContextualizedLane,
  match: WorkMatch,
  route: AnyRoute,
  parentMatchPromise: Promise<WorkMatch> | undefined,
  preload: boolean,
  signal: AbortSignal,
): Promise<LoaderOutcome> {
  if (signal.aborted) {
    return [canceled]
  }
  const routeLoader = route.options.loader
  const loader =
    typeof routeLoader === 'function' ? routeLoader : routeLoader?.handler
  if (!loader) {
    return [success, undefined]
  }

  let flight = match._flight
  let joined = !!flight && router._flights?.get(match.id) === flight
  for (;;) {
    if (!joined) {
      releaseFlight(router, match)
      flight = startFlight(router, match.id, route, (controller) =>
        loader(
          getLoaderContext(
            workerRouter,
            lane,
            match,
            route,
            controller,
            parentMatchPromise,
            preload,
          ),
        ),
      )
    }
    match._flight = flight
    match.abortController = flight![1]
    match.isFetching = 'loader'
    try {
      const outcome = await waitFor(flight![0], signal)
      if (!joined || outcome[0] === success) {
        return outcome
      }
    } catch (cause) {
      if (cause === signal) {
        releaseFlight(router, match)
        return [canceled]
      }
      throw cause
    }
    closeFlight(router, match)
    releaseFlight(router, match)
    joined = false
  }
}

function shouldReloadMatch(
  router: WorkerRouter,
  match: WorkMatch,
  route: AnyRoute,
  options: ExecuteLaneOptions,
  configured?: any,
  donor?: number,
): boolean {
  if (match.status !== 'success') {
    return true
  }

  const preload = !!options.preload
  const preloadStaleTime = route.options.preloadStaleTime
  const staleAge =
    preload ||
    ((donor != null || match.preload) && preloadStaleTime !== undefined)
      ? (preloadStaleTime ?? router.options.defaultPreloadStaleTime ?? 30_000)
      : (route.options.staleTime ?? router.options.defaultStaleTime ?? 0)
  return !!(
    match.invalid ||
    configured ||
    (configured === undefined &&
      Date.now() - (donor ?? match.updatedAt) >= staleAge &&
      (options.forceStaleReload ||
        match.cause === 'enter' ||
        options.base?.some(
          (candidate) =>
            candidate.routeId === match.routeId && candidate.id !== match.id,
        )))
  )
}

function applySuccess(match: WorkMatch, data: unknown): void {
  if (data !== undefined) {
    match.loaderData = data
  }
  match.error = undefined
  match.status = 'success'
  match.invalid = false
  match.isFetching = false
  match.updatedAt = Date.now()
}

function createTask(
  router: ClientRouter,
  workerRouter: WorkerRouter,
  lane: ContextualizedLane,
  index: number,
  tasks: Array<Task>,
  semanticParent: Promise<WorkMatch> | undefined,
  options: ExecuteLaneOptions,
): Promise<WorkMatch> {
  const match = lane.matches[index]!
  const route = getRoute(workerRouter, match)
  const preload = !!options.preload
  let reload = false
  let reloadFailure: LoaderOutcome | undefined
  try {
    if (index < (options.resolvedPrefix ?? 0)) {
      reload = !!router._flights?.get(match.id)
    } else {
      let configured
      if (match.status === 'success') {
        configured = route.options.shouldReload
        if (typeof configured === 'function') {
          configured = configured(
            getLoaderContext(
              workerRouter,
              lane,
              match,
              route,
              options.controller,
              tasks[index - 1]?.match,
              preload,
            ),
          )
        }
      }
      reload = shouldReloadMatch(
        workerRouter,
        match,
        route,
        options,
        configured,
      )
    }
  } catch (cause) {
    releaseFlight(router, match)
    reloadFailure = normalizeError(route, cause)
  }
  const routeLoader = route.options.loader
  const background = !!(
    routeLoader &&
    reload &&
    match.status === 'success' &&
    !preload &&
    !options.sync &&
    ((typeof routeLoader === 'function'
      ? undefined
      : routeLoader?.staleReloadMode) ??
      workerRouter.options.defaultStaleReloadMode) !== 'blocking'
  )
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
      ? Promise.resolve<LoaderOutcome>([success, match.loaderData])
      : loadResource(
          router,
          workerRouter,
          lane,
          match,
          route,
          tasks[index - 1]?.match,
          preload,
          options.controller.signal,
        )
  const outcome = rawOutcome.then((result) => {
    if (loaded && !background && result[0] === success) {
      applySuccess(match, result[1])
      match.preload = preload
    }
    return result
  })

  const chunkFailure = Promise.resolve()
    .then(() => loadRouteChunk(route))
    .then(
      (): IndexedOutcome | undefined => undefined,
      (cause): IndexedOutcome => [index, normalizeError(route, cause)],
    )
  const ready = outcome
    .then((value) => (value[0] === success ? chunkFailure : undefined))
    .then((value) => {
      options.onReady?.()
      return value
    })

  const task = {
    outcome,
    ready,
    match: outcome.then(() => match),
  }
  tasks.push(task)
  if (!background) {
    return task.match
  }
  const candidate = {
    ...match,
    _flight: undefined,
  } as WorkMatch
  const backgroundOutcome = loadResource(
    router,
    workerRouter,
    lane,
    candidate,
    route,
    semanticParent,
    false,
    options.controller.signal,
  ).then((result) => {
    if (result[0] === success) {
      applySuccess(candidate, result[1])
    }
    return result
  })
  const backgroundMatch = backgroundOutcome.then(() => candidate)
  const backgroundTask = {
    index,
    candidate,
    outcome: backgroundOutcome,
    ready: task.ready,
  }
  ;(lane.background ??= []).push(backgroundTask)
  return backgroundMatch
}

function getNotFoundBoundary(
  router: WorkerRouter,
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
  router: WorkerRouter & ClientRouter,
  lane: ContextualizedLane,
  tasks: Array<Task>,
  options: ExecuteLaneOptions,
  serialFailure?: IndexedOutcome,
): Promise<ReducedLane | ControlOutcome> {
  let control =
    serialFailure?.[1][0] === redirected || serialFailure?.[1][0] === canceled
      ? serialFailure
      : undefined
  let firstError = serialFailure?.[1][0] === error ? serialFailure : undefined
  let firstNotFound =
    serialFailure?.[1][0] === notFound ? serialFailure : undefined

  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index]!
    const taskIndex = (task as BackgroundTask).index ?? index
    const outcome = await task.outcome
    if (outcome[0] === redirected || outcome[0] === canceled) {
      control = [taskIndex, outcome]
      break
    }
    if (outcome[0] === error && (!firstError || taskIndex < firstError[0])) {
      firstError = [taskIndex, outcome]
    } else if (
      outcome[0] === notFound &&
      (!firstNotFound || taskIndex < firstNotFound[0])
    ) {
      firstNotFound = [taskIndex, outcome]
    }
  }

  if (control?.[1][0] === redirected && !control[1][1].options.reloadDocument) {
    if ((options.redirects ?? 0) >= 20) {
      firstError = [control[0], [error, new Error('Redirect cycle detected')]]
      control = undefined
    }
  }

  if (control) {
    if (lane.background) {
      discardMatchResources(
        router as AnyRouter,
        lane.background.map((task) => task.candidate),
      )
      lane.background = undefined
    }
    return control[1] as ControlOutcome
  }

  const failure = firstError ?? firstNotFound
  const readinessEnd = failure?.[0] ?? lane.matches.length
  for (let index = 0; index < tasks.length; index++) {
    const task = tasks[index]!
    if (((task as BackgroundTask).index ?? index) >= readinessEnd) {
      break
    }
    const chunkFailure = await task.ready
    if (chunkFailure) {
      firstError = chunkFailure
      break
    }
  }

  if (firstError) {
    const [index, outcome] = firstError
    const match = lane.matches[index]!
    match.status = 'error'
    match.error = outcome[1]
    match.isFetching = false
    try {
      await loadRouteChunk(getRoute(router, match), 'errorComponent')
    } catch {}
    trimLane(router, lane, index + 1)
    return lane as ReducedLane
  }

  if (failure?.[1][0] === notFound) {
    const boundary = getNotFoundBoundary(router, lane.matches, failure)
    const match = lane.matches[boundary]!
    const cause = failure[1][1]
    cause.routeId = match.routeId
    if (match.routeId === router.routeTree.id) {
      match.status = 'success'
      match.globalNotFound = true
      match.error = cause
    } else {
      match.status = 'notFound'
      match.error = cause
    }
    match.isFetching = false
    try {
      await loadRouteChunk(getRoute(router, match), 'notFoundComponent')
    } catch {}
    trimLane(router, lane, boundary + 1)
    return lane as ReducedLane
  }

  return lane as ReducedLane
}

function trimLane(
  router: ClientRouter,
  lane: ContextualizedLane,
  length: number,
): void {
  discardMatchResources(router as AnyRouter, lane.matches.slice(length))
  lane.matches.length = length
  if (!lane.background) {
    return
  }
  let write = 0
  for (const task of lane.background) {
    if (task.index < length) {
      lane.background[write++] = task
    } else {
      discardMatchResources(router as AnyRouter, [task.candidate])
    }
  }
  lane.background.length = write
}

async function projectLane(
  router: WorkerRouter,
  lane: ReducedLane,
  start = 0,
): Promise<ProjectedLane> {
  for (let index = start; index < lane.matches.length; index++) {
    const match = lane.matches[index]!
    const route = getRoute(router, match)
    if (!route.options.head && !route.options.scripts) {
      continue
    }
    try {
      const context = {
        ssr: router.options.ssr,
        matches: lane.matches,
        match,
        params: match.params,
        loaderData: match.loaderData,
      }
      const [head, scripts] = await Promise.all([
        route.options.head?.(context),
        route.options.scripts?.(context),
      ])
      match.meta = head?.meta
      match.links = head?.links
      match.headScripts = head?.scripts
      match.styles = head?.styles
      match.scripts = scripts
    } catch (cause) {
      console.error(`Error executing head for route ${route.id}:`, cause)
    }
  }
  return lane as ProjectedLane
}

export async function executeClientLane(
  router: AnyRouter,
  location: ParsedLocation,
  matches: Array<AnyRouteMatch>,
  options: ExecuteLaneOptions,
): Promise<LaneResult> {
  const clientRouter = router as ClientRouter
  const workerRouter = router as WorkerRouter
  const matched = {
    location,
    matches: matches as Array<WorkMatch>,
  } as MatchedLane
  for (const match of matched.matches) {
    const flight = clientRouter._flights?.get(match.id) ?? match._flight
    if (flight) {
      match._flight = flight
      flight[2]++
    }
  }
  const failure = await contextualize(workerRouter, matched, options)
  if (failure) {
    options.sync = true
  }
  const contextualized = matched as ContextualizedLane
  const tasks: Array<Task> = []
  let semanticParent: Promise<WorkMatch> | undefined
  let end = failure?.[0] ?? contextualized.matches.length
  if (failure?.[1][0] === notFound) {
    end = Math.min(
      end,
      getNotFoundBoundary(workerRouter, contextualized.matches, failure) + 1,
    )
  } else if (failure?.[1][0] === redirected || failure?.[1][0] === canceled) {
    end = 0
  }
  for (let index = 0; index < end; index++) {
    if (options.controller.signal.aborted) {
      break
    }
    semanticParent = createTask(
      clientRouter,
      workerRouter,
      contextualized,
      index,
      tasks,
      semanticParent,
      options,
    )
  }
  const reduced = await reduceLane(
    router as WorkerRouter & ClientRouter,
    contextualized,
    tasks,
    options,
    failure,
  )
  if (Array.isArray(reduced)) {
    return reduced
  }
  return projectLane(
    workerRouter,
    reduced,
    Math.min(options.resolvedPrefix ?? 0, reduced.matches.length - 1),
  )
}

function semanticMatches(router: CoordinatorRouter): Array<AnyRouteMatch> {
  return router._committedMatches ?? router.stores.matches.get()
}

function pendingConfig(
  router: AnyRouter,
  matches: Array<AnyRouteMatch>,
): [delay: number, boundary: number, min: number] | undefined {
  const presented = router.stores.matches.get()
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]!
    const visible =
      match.status === 'success' &&
      presented[index]?.id === match.id &&
      presented[index]?.status === 'pending'
    if (match.status === 'success' && !visible) {
      continue
    }
    const route = getRoute(router, match as WorkMatch)
    const delay = visible
      ? 0
      : match.invalid
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
  return undefined
}

function renderPending(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  boundary: number,
): Promise<boolean> {
  const offered = tx.matches.slice(0, boundary + 1) as Array<WorkMatch>
  offered[boundary] = {
    ...offered[boundary]!,
    _flight: undefined,
    status: 'pending',
  }
  return router.startTransition(() => {
    router.stores.setMatches(offered)
  })
}

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
  session.ack = renderPending(router, tx, boundary).then((rendered) => {
    if (rendered && router._pending === session) {
      session.deadline = Date.now() + min
    }
    return rendered
  })
}

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
    closeFlight(router, match as WorkMatch)
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
        _flight: undefined,
      } as WorkMatch)
    }
  }

  const now = Date.now()
  let write = 0
  for (const match of cached) {
    const work = match as WorkMatch
    const route = getRoute(router, work)
    const preloadGcTime =
      route.options.preloadGcTime ??
      router.options.defaultPreloadGcTime ??
      300_000
    const donor = work._preloadContext
    if (
      match.status === 'success' &&
      ((donor != null && now - donor < preloadGcTime) ||
        (route.options.loader &&
          now - match.updatedAt <
            (match.preload
              ? preloadGcTime
              : (route.options.gcTime ??
                router.options.defaultGcTime ??
                300_000))))
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
    router,
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
        Promise.reject(cause)
      }
    }
    if (match) {
      try {
        getRoute(router, match as WorkMatch).options[
          oldMatch?.routeId === match.routeId ? 'onStay' : 'onEnter'
        ]?.(match)
      } catch (cause) {
        Promise.reject(cause)
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
  tasks: Array<BackgroundTask>,
): Promise<void> {
  const backgroundMatches = tasks.map((task) => task.candidate)
  const next = base.slice() as Array<WorkMatch>
  for (const task of tasks) {
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
  const reduced = await reduceLane(
    router as WorkerRouter & ClientRouter,
    lane,
    tasks,
    options,
  )
  if (Array.isArray(reduced)) {
    discardMatchResources(router, backgroundMatches)
    if (
      reduced[0] === redirected &&
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
  const projected = await projectLane(router as WorkerRouter, reduced)
  if (router._tx !== tx || router._committedMatches !== base) {
    discardMatchResources(router, backgroundMatches)
    return
  }
  router.batch(() => {
    publishMatches(router, projected.matches, base)
  })
  transferMatchResources(
    router,
    [...base, ...backgroundMatches],
    projected.matches,
  )
}

async function runClientTransaction(
  router: CoordinatorRouter,
  tx: LoadTransaction,
  forceStaleReload: boolean,
  onReady?: () => void,
  sync?: boolean,
  resolvedPrefix?: number,
): Promise<void> {
  const options: ExecuteLaneOptions = {
    controller: tx.controller,
    forceStaleReload,
    sync,
    base: semanticMatches(router),
    resolvedPrefix,
    redirects: tx.redirects,
    onReady,
  }
  const result = await executeClientLane(
    router,
    tx.location,
    tx.matches,
    options,
  )

  if (Array.isArray(result)) {
    finishPending(router, tx)
    discardMatchResources(router, tx.matches)
    if (result[0] === redirected && router._tx === tx) {
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
  if (router._tx !== tx) {
    finishPending(router, tx)
    discardMatchResources(router, result.matches)
    return
  }
  const toLocation = tx.location
  const changeInfo = getLocationChangeInfo(
    toLocation,
    router.stores.resolvedLocation.get(),
  )
  await router.startViewTransition(async () => {
    if (router._tx !== tx) {
      discardMatchResources(router, result.matches)
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

export async function loadClientRouter(
  router: AnyRouter,
  opts?: {
    sync?: boolean
    /** @internal */
    _refreshRouteId?: string
  },
): Promise<void> {
  const clientRouter = router as CoordinatorRouter
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
  const committed = (clientRouter._committedMatches ??=
    router.stores.matches.get())
  const previousOwner = clientRouter._tx
  const resolvedLocation = router.stores.resolvedLocation.get()
  const previousLocation = resolvedLocation ?? router.stores.location.get()
  const controller = new AbortController()
  clientRouter._preflight?.abort()
  clientRouter._preflight = controller

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
    const stale =
      controller.signal.aborted || clientRouter._tx !== previousOwner
    controller.abort()
    if (stale) {
      await awaitCurrent(clientRouter, previousOwner)
      return
    }
    if (!isRedirect(cause)) {
      await awaitCurrent(clientRouter)
      router.commitLocationPromise?.resolve()
      router.commitLocationPromise = undefined
      return
    }
    await router.navigate({
      ...cause.options,
      replace: true,
      ignoreBlocker: true,
    })
    await awaitCurrent(clientRouter, previousOwner)
    return
  }

  if (controller.signal.aborted || clientRouter._tx !== previousOwner) {
    controller.abort()
    await awaitCurrent(clientRouter, previousOwner)
    return
  }
  clientRouter._preflight = undefined
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

  const tx: LoadTransaction = {
    location,
    controller,
    matches,
    done: Promise.resolve()
      .then(() =>
        runClientTransaction(
          clientRouter,
          tx,
          refreshRouteId ? false : sameHref,
          refreshRouteId ? undefined : () => offerPending(clientRouter, tx),
          opts?.sync,
          resolvedPrefix,
        ),
      )
      .catch(() => {
        if (clientRouter._tx === tx) {
          finishPending(clientRouter, tx)
          controller.abort()
          discardMatchResources(router, tx.matches)
          router.batch(() => {
            router.stores.status.set('idle')
            router.stores.setMatches(clientRouter._committedMatches ?? [])
          })
          if (clientRouter._tx !== tx) {
            return
          }
          router.commitLocationPromise?.resolve()
          router.commitLocationPromise = undefined
        }
      }),
    redirects: previousOwner?.redirecting ? previousOwner.redirects : undefined,
  }
  clientRouter._tx = tx
  previousOwner?.controller.abort()
  if (previousOwner) {
    discardMatchResources(router, previousOwner.matches)
  }

  router.batch(() => {
    router.stores.status.set('pending')
    router.stores.location.set(location)
  })
  if (!refreshRouteId) {
    offerPending(clientRouter, tx)
  }

  try {
    await tx.done
  } finally {
    await awaitCurrent(clientRouter, tx)
  }
}

export function refreshClientRoute(
  router: AnyRouter,
  routeId: string,
): Promise<void> {
  const clientRouter = router as CoordinatorRouter
  if (clientRouter._flights) {
    for (const flight of clientRouter._flights.values()) {
      flight[1].abort()
    }
    clientRouter._flights.clear()
  }
  router.clearCache()

  return loadClientRouter(router, { sync: true, _refreshRouteId: routeId })
}

export async function preloadClientRoute(
  router: AnyRouter,
  opts: any,
  redirects = 0,
): Promise<Array<AnyRouteMatch> | undefined> {
  if (redirects > 20) {
    return
  }
  const clientRouter = router as CoordinatorRouter
  const owner = clientRouter._tx
  const location = opts._builtLocation ?? router.buildLocation(opts)
  const base = semanticMatches(clientRouter)
  const plannedCache = router.stores.cachedMatches.get()
  const controller = new AbortController()
  let matches: Array<AnyRouteMatch> | undefined
  try {
    matches = router.matchRoutes(location, {
      throwOnError: true,
      preload: true,
      _controller: controller,
      _isCurrent: () => clientRouter._tx === owner,
    })
    let resolvedPrefix = 0
    while (
      base[resolvedPrefix]?.status === 'success' &&
      base[resolvedPrefix]?.id === matches[resolvedPrefix]?.id
    ) {
      resolvedPrefix++
    }
    const result = await executeClientLane(router, location, matches, {
      controller,
      preload: true,
      base,
      resolvedPrefix,
    })
    if (Array.isArray(result)) {
      discardMatchResources(router, matches)
      if (result[0] === redirected && !result[1].options.reloadDocument) {
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

    matches = result.matches
    if (matches.some((match) => match.status !== 'success')) {
      discardMatchResources(router, matches)
      return
    }

    const active = new Set(
      semanticMatches(clientRouter).map((match) => match.id),
    )
    const previous = router.stores.cachedMatches.get()
    const candidates: Array<AnyRouteMatch> = []
    let obsoleteContext = false
    for (const match of matches as Array<WorkMatch>) {
      if (process.env.NODE_ENV !== 'production') {
        obsoleteContext ||=
          match._preloadContext != null &&
          match._preloadBeforeLoad !==
            getRoute(router, match).options.beforeLoad
        if (obsoleteContext) {
          releaseFlight(clientRouter, match)
          continue
        }
      }
      if (
        active.has(match.id) ||
        previous.find((candidate) => candidate.id === match.id) !==
          plannedCache.find((candidate) => candidate.id === match.id)
      ) {
        releaseFlight(clientRouter, match)
        continue
      }
      closeFlight(clientRouter, match)
      candidates.push(match)
    }
    const ids = new Set(candidates.map((match) => match.id))
    const cached = previous
      .filter((match) => !ids.has(match.id))
      .concat(candidates)
    router.stores.setCached(cached)
    transferMatchResources(router, previous, [
      ...cached,
      ...semanticMatches(clientRouter),
    ])
    return matches
  } catch (cause) {
    if (!matches) {
      if (controller.signal.aborted) {
        return
      }
      throw cause
    }
    controller.abort()
    discardMatchResources(router, matches)
    if (clientRouter._tx !== owner) {
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
