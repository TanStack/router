// Keep this filename free of a secondary extension so declaration generation
// can rewrite relative imports for both ESM and CJS.
import { isNotFound } from './not-found'
import { isRedirect, redirect } from './redirect'
import { rootRouteId } from './root'
import { loadRouteChunk } from './route-chunks'
import type { ParsedLocation } from './location'
import type { AnyRouteMatch } from './Matches'
import type { NotFoundError } from './not-found'
import type {
  AnyRoute,
  BeforeLoadContextOptions,
  LoaderFnContext,
  SsrContextOptions,
} from './route'
import type { AnyRedirect } from './redirect'
import type { AnyRouter, SSROption } from './router'

declare const serverLanePhase: unique symbol

type ServerLane<TPhase extends 'matched' | 'contextualized' | 'reduced'> = {
  readonly [serverLanePhase]: TPhase
  location: ParsedLocation
  matches: Array<AnyRouteMatch>
}

type MatchedLane = ServerLane<'matched'>

type IndexedOutcome = [index: number, outcome: LoadOutcome]

type ContextualizedLane = ServerLane<'contextualized'> & {
  end: number
  failure?: IndexedOutcome
}

type ReducedLane = ServerLane<'reduced'>

const success = 0
const error = 1
const notFound = 2
const redirected = 3
const skipped = 4

type LoadOutcome =
  | [typeof success, data: unknown]
  | [typeof error, error: unknown]
  | [typeof notFound, error: NotFoundError]
  | [typeof redirected, redirect: AnyRedirect]
  | [typeof skipped]

type LoaderTask = {
  index: number
  outcome: Promise<LoadOutcome>
  match: Promise<AnyRouteMatch>
}

type ServerWorker = Pick<
  AnyRouter,
  | 'buildLocation'
  | 'isShell'
  | 'navigate'
  | 'options'
  | 'resolveRedirect'
  | 'routeTree'
  | 'routesById'
>

export type ServerLoadResult =
  | {
      type: 'render'
      status: 200 | 404 | 500
      matches: Array<AnyRouteMatch>
    }
  | { type: 'redirect'; redirect: AnyRedirect }

function getRoute(router: ServerWorker, match: AnyRouteMatch): AnyRoute {
  return (router.routesById as Record<string, AnyRoute>)[match.routeId]!
}

function normalize(value: unknown, rejected: boolean): LoadOutcome {
  if (isRedirect(value)) {
    return [redirected, value]
  }
  if (isNotFound(value)) {
    return [notFound, value]
  }
  return rejected ? [error, value] : [success, value]
}

function normalizeError(route: AnyRoute, cause: unknown): LoadOutcome {
  let outcome = normalize(cause, true)
  if (outcome[0] !== error) {
    return outcome
  }
  try {
    route.options.onError?.(cause)
  } catch (onErrorCause) {
    outcome = normalize(onErrorCause, true)
  }
  return outcome
}

function maybe<TValue>(
  value: TValue,
  cause: unknown,
): { status: 'success'; value: TValue } | { status: 'error'; error: unknown } {
  if (cause !== undefined) {
    return { status: 'error', error: cause }
  }
  return { status: 'success', value }
}

function navigateFrom(router: ServerWorker, location: ParsedLocation) {
  return (options: any) =>
    router.navigate({
      ...options,
      _fromLocation: location,
    })
}

async function resolveSsr(
  router: ServerWorker,
  lane: MatchedLane,
  index: number,
): Promise<SSROption> {
  const match = lane.matches[index]!
  const route = getRoute(router, match)
  const parentSsr = lane.matches[index - 1]?.ssr

  if (router.isShell()) {
    return route.id === rootRouteId
  }
  if (parentSsr === false) {
    return false
  }

  const inherit = (value: SSROption): SSROption => {
    return value === true && parentSsr === 'data-only' ? 'data-only' : value
  }
  const defaultSsr = router.options.defaultSsr ?? true
  const option = route.options.ssr
  if (option === undefined) {
    return inherit(defaultSsr)
  }
  if (typeof option !== 'function') {
    return inherit(option)
  }

  const context: SsrContextOptions<any, any, any> = {
    search: maybe(match.search, match.searchError),
    params: maybe(match.params, match.paramsError),
    location: lane.location,
    matches: lane.matches.map((candidate) => ({
      index: candidate.index,
      pathname: candidate.pathname,
      fullPath: candidate.fullPath,
      staticData: candidate.staticData,
      id: candidate.id,
      routeId: candidate.routeId,
      search: maybe(candidate.search, candidate.searchError),
      params: maybe(candidate.params, candidate.paramsError),
      ssr: candidate.ssr,
    })),
  }
  return inherit((await option(context)) ?? defaultSsr)
}

function stampNotFound(
  match: AnyRouteMatch,
  outcome: LoadOutcome,
): LoadOutcome {
  if (outcome[0] === notFound && !outcome[1].routeId) {
    outcome[1].routeId = match.routeId
  }
  return outcome
}

async function contextualize(
  router: ServerWorker,
  lane: MatchedLane,
  preload: boolean,
): Promise<ContextualizedLane> {
  let end = lane.matches.length
  let failure: IndexedOutcome | undefined
  let parentContext: Record<string, unknown> = {
    ...(router.options.context ?? {}),
  }

  for (let index = 0; index < lane.matches.length; index++) {
    const match = lane.matches[index]!
    const route = getRoute(router, match)
    try {
      match.ssr = await resolveSsr(router, lane, index)
    } catch (cause) {
      failure = [index, stampNotFound(match, normalizeError(route, cause))]
      end = index
      break
    }

    const context = {
      ...parentContext,
      ...match.__routeContext,
    }
    match.context = context

    const validationError = match.paramsError ?? match.searchError
    if (validationError !== undefined) {
      failure = [
        index,
        stampNotFound(match, normalizeError(route, validationError)),
      ]
      end = index
      break
    }

    if (match.ssr === false || !route.options.beforeLoad) {
      parentContext = context
      continue
    }

    const abortController = match.abortController
    const options: BeforeLoadContextOptions<
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
      abortController,
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
      const beforeLoadContext = await route.options.beforeLoad(options)
      const outcome = stampNotFound(match, normalize(beforeLoadContext, false))
      if (outcome[0] !== success) {
        failure = [index, outcome]
        end = index
        break
      }
      match.__beforeLoadContext = beforeLoadContext
      match.context = {
        ...context,
        ...beforeLoadContext,
      }
      parentContext = match.context
    } catch (cause) {
      if (cause instanceof Promise) {
        throw cause
      }
      failure = [index, stampNotFound(match, normalizeError(route, cause))]
      end = index
      break
    }
  }

  return {
    location: lane.location,
    matches: lane.matches,
    end,
    failure,
  } as ContextualizedLane
}

function loaderContext(
  router: ServerWorker,
  lane: ContextualizedLane,
  match: AnyRouteMatch,
  route: AnyRoute,
  index: number,
  tasks: Array<LoaderTask>,
  preload: boolean,
): LoaderFnContext {
  return {
    params: match.params,
    deps: match.loaderDeps,
    preload,
    parentMatchPromise: tasks[index - 1]?.match as any,
    abortController: match.abortController,
    context: match.context,
    location: lane.location,
    navigate: navigateFrom(router, lane.location),
    cause: preload ? 'preload' : match.cause,
    route,
    ...router.options.additionalContext,
  }
}

function startLoader(
  router: ServerWorker,
  lane: ContextualizedLane,
  index: number,
  tasks: Array<LoaderTask>,
  preload: boolean,
): LoaderTask {
  const match = lane.matches[index]!
  const route = getRoute(router, match)
  let outcome: Promise<LoadOutcome>

  if (match.ssr === false) {
    outcome = Promise.resolve<LoadOutcome>([skipped])
  } else {
    const option = route.options.loader
    const loader = typeof option === 'function' ? option : option?.handler
    if (!loader) {
      outcome = Promise.resolve<LoadOutcome>([success, undefined])
    } else {
      const failed = (cause: unknown): LoadOutcome =>
        (cause as any)?.name === 'AbortError' &&
        !match.abortController.signal.aborted
          ? [success, undefined]
          : normalizeError(route, cause)
      let value: unknown
      let rejected = false
      try {
        value = loader(
          loaderContext(router, lane, match, route, index, tasks, preload),
        )
      } catch (cause) {
        value = cause
        rejected = true
      }
      outcome = Promise.resolve(value).then(
        (result) => {
          const normalized = rejected
            ? failed(result)
            : normalize(result, false)
          return stampNotFound(match, normalized)
        },
        (cause) => stampNotFound(match, failed(cause)),
      )
    }
  }

  const parentMatch = outcome.then((result) => {
    const snapshot = { ...match }
    if (result[0] === success) {
      snapshot.loaderData = result[1]
      snapshot.status = 'success'
      snapshot.error = undefined
    } else if (result[0] === error) {
      snapshot.status = 'error'
      snapshot.error = result[1]
    } else if (result[0] === notFound) {
      snapshot.status = 'notFound'
      snapshot.error = result[1]
    }
    return snapshot
  })

  return { index, outcome, match: parentMatch }
}

function getNotFoundBoundary(
  router: ServerWorker,
  matches: Array<AnyRouteMatch>,
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
  for (let candidate = index; candidate >= 0; candidate--) {
    if (getRoute(router, matches[candidate]!).options.notFoundComponent) {
      return candidate
    }
  }
  return cause.routeId ? index : 0
}

function chooseFailure(
  router: ServerWorker,
  matches: Array<AnyRouteMatch>,
  outcomes: Array<IndexedOutcome>,
): IndexedOutcome | undefined {
  let winner: IndexedOutcome | undefined
  let winnerBoundary = Infinity
  for (const indexed of outcomes) {
    const kind = indexed[1][0]
    if (kind === redirected) {
      return indexed
    }
    const boundary =
      kind === notFound
        ? getNotFoundBoundary(router, matches, indexed)
        : indexed[0]
    if (
      boundary < winnerBoundary ||
      (boundary === winnerBoundary &&
        kind === error &&
        winner?.[1][0] === notFound)
    ) {
      winner = indexed
      winnerBoundary = boundary
    }
  }
  return winner
}

function abortMatches(matches: Array<AnyRouteMatch>, start = 0): void {
  for (let index = start; index < matches.length; index++) {
    matches[index]!.abortController.abort()
  }
}

function resolveServerRedirect(
  router: ServerWorker,
  location: ParsedLocation,
  value: AnyRedirect,
): ServerLoadResult {
  value.options._fromLocation = location
  return { type: 'redirect', redirect: router.resolveRedirect(value) }
}

function applyFailure(
  router: ServerWorker,
  lane: ContextualizedLane,
  indexed: IndexedOutcome | undefined,
): { status: 200 | 404 | 500; boundary?: number; kind?: number } {
  if (!indexed) {
    const boundary = lane.matches.findIndex((match) => match.globalNotFound)
    if (boundary >= 0) {
      abortMatches(lane.matches, boundary + 1)
      lane.matches.length = boundary + 1
      return { status: 404, boundary, kind: notFound }
    }
    return { status: 200 }
  }

  const [index, outcome] = indexed
  if (outcome[0] === error) {
    const match = lane.matches[index]!
    match.status = 'error'
    match.error = outcome[1]
    match.isFetching = false
    abortMatches(lane.matches, index + 1)
    lane.matches.length = index + 1
    return { status: 500, boundary: index, kind: error }
  }

  const boundary = getNotFoundBoundary(router, lane.matches, indexed)
  const match = lane.matches[boundary]!
  const cause = outcome[1] as NotFoundError
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
  abortMatches(lane.matches, boundary + 1)
  lane.matches.length = boundary + 1
  return { status: 404, boundary, kind: notFound }
}

async function loadSelectedChunks(
  router: ServerWorker,
  lane: ContextualizedLane,
  terminal: ReturnType<typeof applyFailure>,
): Promise<Array<IndexedOutcome>> {
  const chunks = lane.matches.map(async (match, index) => {
    if (match.ssr !== true) {
      return undefined
    }
    const route = getRoute(router, match)
    try {
      if (terminal.boundary === index && terminal.kind === error) {
        await loadRouteChunk(route, 'errorComponent')
      } else if (terminal.boundary === index && terminal.kind === notFound) {
        if (match.globalNotFound) {
          await Promise.all([
            loadRouteChunk(route),
            loadRouteChunk(route, 'notFoundComponent'),
          ])
        } else {
          await loadRouteChunk(route, 'notFoundComponent')
        }
      } else {
        await loadRouteChunk(route)
      }
      return undefined
    } catch (cause) {
      return [index, stampNotFound(match, normalizeError(route, cause))] as
        | IndexedOutcome
        | undefined
    }
  })
  const settled = await Promise.all(chunks)
  return settled.filter(Boolean) as Array<IndexedOutcome>
}

async function ensureFailureChunk(
  router: ServerWorker,
  lane: ContextualizedLane,
  terminal: ReturnType<typeof applyFailure>,
): Promise<IndexedOutcome | undefined> {
  if (terminal.boundary === undefined || terminal.kind === undefined) {
    return
  }
  const match = lane.matches[terminal.boundary]!
  if (match.ssr !== true) {
    return
  }
  const route = getRoute(router, match)
  try {
    await loadRouteChunk(
      route,
      terminal.kind === error ? 'errorComponent' : 'notFoundComponent',
    )
    return
  } catch (cause) {
    return [
      terminal.boundary,
      stampNotFound(match, normalizeError(route, cause)),
    ]
  }
}

async function project(router: ServerWorker, lane: ReducedLane): Promise<void> {
  for (const match of lane.matches) {
    const route = getRoute(router, match)
    if (
      match.ssr !== true ||
      (!route.options.head && !route.options.scripts && !route.options.headers)
    ) {
      continue
    }
    const context = {
      ssr: router.options.ssr,
      matches: lane.matches,
      match,
      params: match.params,
      loaderData: match.loaderData,
    }
    let closed = false
    let failAssets!: () => void
    const assetFailure = new Promise<void>((resolve) => {
      failAssets = resolve
    })
    const run = (
      fn: ((context: any) => any) | undefined,
      commit: (value: any) => void,
      decorative: boolean,
    ) => {
      let value: unknown
      try {
        value = fn?.(context)
      } catch (cause) {
        console.error(`Error executing route asset for ${route.id}:`, cause)
        if (decorative) {
          failAssets()
        }
        return Promise.resolve()
      }
      return Promise.resolve(value).then(
        (result) => {
          if (!closed) {
            commit(result)
          }
        },
        (cause) => {
          console.error(`Error executing route asset for ${route.id}:`, cause)
          if (decorative) {
            failAssets()
          }
        },
      )
    }
    const head = run(
      route.options.head,
      (value) => {
        match.meta = value?.meta
        match.links = value?.links
        match.headScripts = value?.scripts
        match.styles = value?.styles
      },
      true,
    )
    const scripts = run(
      route.options.scripts,
      (value) => {
        match.scripts = value
      },
      true,
    )
    await run(
      route.options.headers,
      (value) => {
        match.headers = value
      },
      false,
    )
    await Promise.race([Promise.all([head, scripts]), assetFailure])
    closed = true
  }
}

export async function loadServer(
  router: AnyRouter,
  location: ParsedLocation,
  matchedMatches: Array<AnyRouteMatch>,
  preload = false,
): Promise<ServerLoadResult> {
  const worker = router as ServerWorker
  const matched = {
    location,
    matches: matchedMatches.map((match) => ({
      ...match,
      __beforeLoadContext: undefined,
      context: {},
      isFetching: false,
      abortController: new AbortController(),
    })),
  } as MatchedLane
  const lane = await contextualize(worker, matched, preload)

  let loaderEnd = lane.end
  if (lane.failure?.[1][0] === redirected) {
    loaderEnd = 0
  } else if (lane.failure?.[1][0] === notFound) {
    loaderEnd = Math.min(
      loaderEnd,
      getNotFoundBoundary(worker, lane.matches, lane.failure) + 1,
    )
  }

  const tasks: Array<LoaderTask> = []
  for (let index = 0; index < loaderEnd; index++) {
    const task = startLoader(worker, lane, index, tasks, preload)
    tasks.push(task)
  }

  const outcomes = lane.failure ? [lane.failure] : []
  for (const task of tasks) {
    const outcome = await task.outcome
    if (outcome[0] === success) {
      const match = lane.matches[task.index]!
      match.loaderData = outcome[1]
      match.status = 'success'
      match.error = undefined
      match.invalid = false
      match.isFetching = false
      match.updatedAt = Date.now()
    } else if (outcome[0] !== skipped) {
      outcomes.push([task.index, outcome])
    }
  }

  let failure = chooseFailure(worker, lane.matches, outcomes)
  if (failure?.[1][0] === redirected) {
    abortMatches(lane.matches)
    return resolveServerRedirect(worker, location, failure[1][1])
  }

  let terminal = applyFailure(worker, lane, failure)
  const chunkOutcomes = await loadSelectedChunks(worker, lane, terminal)
  if (chunkOutcomes.length) {
    failure = chooseFailure(worker, lane.matches, [
      ...outcomes,
      ...chunkOutcomes,
    ])
    if (failure?.[1][0] === redirected) {
      abortMatches(lane.matches)
      return resolveServerRedirect(worker, location, failure[1][1])
    }
    terminal = applyFailure(worker, lane, failure)
    const boundaryFailure = await ensureFailureChunk(worker, lane, terminal)
    if (boundaryFailure?.[1][0] === redirected) {
      abortMatches(lane.matches)
      return resolveServerRedirect(worker, location, boundaryFailure[1][1])
    } else if (boundaryFailure) {
      terminal = applyFailure(worker, lane, boundaryFailure)
    }
  }

  await project(worker, {
    location: lane.location,
    matches: lane.matches,
  } as ReducedLane)
  return { type: 'render', status: terminal.status, matches: lane.matches }
}

export async function loadServerRouter(
  router: AnyRouter,
  _opts?: Parameters<AnyRouter['load']>[0],
): Promise<void> {
  router.updateLatestLocation()
  const next = router.latestLocation
  let result: ServerLoadResult
  try {
    const canonical = router.buildLocation({
      to: next.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    })
    if (next.publicHref !== canonical.publicHref) {
      const href = canonical.publicHref || '/'
      throw canonical.external
        ? redirect({ href })
        : redirect({ href, _builtLocation: canonical })
    }

    const fromLocation = router.stores.resolvedLocation.get()
    const changeInfo = {
      fromLocation,
      toLocation: next,
      pathChanged: fromLocation?.pathname !== next.pathname,
      hrefChanged: fromLocation?.href !== next.href,
      hashChanged: fromLocation?.hash !== next.hash,
    }
    router.emit({ type: 'onBeforeNavigate', ...changeInfo })
    router.emit({ type: 'onBeforeLoad', ...changeInfo })
    result = await loadServer(router, next, router.matchRoutes(next))
  } catch (cause) {
    if (!isRedirect(cause)) {
      throw cause
    }
    result = { type: 'redirect', redirect: cause }
  }

  router._serverResult = result
  router.batch(() => {
    router.stores.location.set(next)
    router.stores.status.set('idle')
    if (result.type === 'render') {
      router.stores.setMatches(result.matches)
      router.stores.resolvedLocation.set(next)
    }
  })
  if (result.type === 'render') {
    router._committedMatches = result.matches
  }
  router.commitLocationPromise?.resolve()
  router.commitLocationPromise = undefined
}
