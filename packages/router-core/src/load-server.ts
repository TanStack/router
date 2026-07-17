// Keep this filename free of a secondary extension so declaration generation
// can rewrite relative imports for both ESM and CJS.
import { isNotFound } from './not-found'
import { isRedirect, redirect } from './redirect'
import { rootRouteId } from './root'
import { loadRouteChunk } from './route-chunks'
import { getLocationChangeInfo } from './router'
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

type IndexedOutcome = [index: number, outcome: LoaderOutcome]

type ContextualizedLane = ServerLane<'contextualized'> & {
  end: number
  failure?: IndexedOutcome
}

type ReducedLane = ServerLane<'reduced'>

const SUCCESS = 0
const ERROR = 1
const NOT_FOUND = 2
const REDIRECTED = 3
const SKIPPED = 4

type LoaderOutcome =
  | [typeof SUCCESS, data: unknown]
  | [typeof ERROR, error: unknown]
  | [typeof NOT_FOUND, error: NotFoundError]
  | [typeof REDIRECTED, redirect: AnyRedirect]
  | [typeof SKIPPED]

type LoaderTask = {
  index: number
  outcome: Promise<LoaderOutcome>
  match: Promise<AnyRouteMatch>
}

export type ServerLoadResult =
  | {
      type: 'render'
      status: 200 | 404 | 500
      matches: Array<AnyRouteMatch>
    }
  | { type: 'redirect'; redirect: AnyRedirect }

function getRoute(router: AnyRouter, match: AnyRouteMatch): AnyRoute {
  return router.routesById[match.routeId]
}

function normalize(value: unknown, rejected: boolean): LoaderOutcome {
  if (isRedirect(value)) {
    return [REDIRECTED, value]
  }
  if (isNotFound(value)) {
    return [NOT_FOUND, value]
  }
  return rejected ? [ERROR, value] : [SUCCESS, value]
}

function normalizeError(route: AnyRoute, cause: unknown): LoaderOutcome {
  let outcome = normalize(cause, true)
  if (outcome[0] !== ERROR) {
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

function navigateFrom(router: AnyRouter, location: ParsedLocation) {
  return (options: any) =>
    router.navigate({
      ...options,
      _fromLocation: location,
    })
}

async function resolveSsr(
  router: AnyRouter,
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
  outcome: LoaderOutcome,
): LoaderOutcome {
  if (outcome[0] === NOT_FOUND && !outcome[1].routeId) {
    outcome[1].routeId = match.routeId
  }
  return outcome
}

async function contextualize(
  router: AnyRouter,
  lane: MatchedLane,
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
      preload: false,
      context,
      location: lane.location,
      navigate: navigateFrom(router, lane.location),
      buildLocation: router.buildLocation,
      cause: match.cause,
      matches: lane.matches,
      routeId: route.id,
      ...router.options.additionalContext,
    }

    try {
      const beforeLoadContext = await route.options.beforeLoad(options)
      const outcome = stampNotFound(match, normalize(beforeLoadContext, false))
      if (outcome[0] !== SUCCESS) {
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

function getLoaderContext(
  router: AnyRouter,
  lane: ContextualizedLane,
  match: AnyRouteMatch,
  route: AnyRoute,
  index: number,
  tasks: Array<LoaderTask>,
): LoaderFnContext {
  return {
    params: match.params,
    deps: match.loaderDeps,
    preload: false,
    parentMatchPromise: tasks[index - 1]?.match,
    abortController: match.abortController,
    context: match.context,
    location: lane.location,
    navigate: navigateFrom(router, lane.location),
    cause: match.cause,
    route,
    ...router.options.additionalContext,
  }
}

function createLoaderTask(
  router: AnyRouter,
  lane: ContextualizedLane,
  index: number,
  tasks: Array<LoaderTask>,
): LoaderTask {
  const match = lane.matches[index]!
  const route = getRoute(router, match)
  let outcome: Promise<LoaderOutcome>

  if (match.ssr === false) {
    outcome = Promise.resolve<LoaderOutcome>([SKIPPED])
  } else {
    const routeLoader = route.options.loader
    const loader =
      typeof routeLoader === 'function' ? routeLoader : routeLoader?.handler
    if (!loader) {
      outcome = Promise.resolve<LoaderOutcome>([SUCCESS, undefined])
    } else {
      outcome = Promise.resolve()
        .then(() =>
          loader(getLoaderContext(router, lane, match, route, index, tasks)),
        )
        .then(
          (result): LoaderOutcome =>
            match.abortController.signal.aborted
              ? [SKIPPED]
              : stampNotFound(match, normalize(result, false)),
          (cause): LoaderOutcome =>
            match.abortController.signal.aborted
              ? [SKIPPED]
              : stampNotFound(match, normalizeError(route, cause)),
        )
    }
  }

  const parentMatch = outcome.then((result) => {
    const snapshot = { ...match }
    if (result[0] === SUCCESS) {
      snapshot.loaderData = result[1]
      snapshot.status = 'success'
      snapshot.error = undefined
      snapshot.invalid = false
      snapshot.isFetching = false
    } else if (result[0] === ERROR) {
      snapshot.status = 'error'
      snapshot.error = result[1]
    } else if (result[0] === NOT_FOUND) {
      snapshot.status = 'notFound'
      snapshot.error = result[1]
    }
    return snapshot
  })

  return { index, outcome, match: parentMatch }
}

function getNotFoundBoundary(
  router: AnyRouter,
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

function abortMatches(matches: Array<AnyRouteMatch>, start = 0): void {
  for (let index = start; index < matches.length; index++) {
    matches[index]!.abortController.abort()
  }
}

function resolveServerRedirect(
  router: AnyRouter,
  location: ParsedLocation,
  value: AnyRedirect,
): ServerLoadResult {
  value.options._fromLocation = location
  return { type: 'redirect', redirect: router.resolveRedirect(value) }
}

function applyFailure(
  router: AnyRouter,
  lane: ContextualizedLane,
  indexed: IndexedOutcome | undefined,
): { status: 200 | 404 | 500; boundary?: number; kind?: number } {
  if (!indexed) {
    const boundary = lane.matches.findIndex((match) => match.globalNotFound)
    if (boundary >= 0) {
      abortMatches(lane.matches, boundary + 1)
      lane.matches.length = boundary + 1
      return { status: 404, boundary, kind: NOT_FOUND }
    }
    return { status: 200 }
  }

  const [index, outcome] = indexed
  if (outcome[0] === ERROR) {
    const match = lane.matches[index]!
    match.globalNotFound = undefined
    match.status = 'error'
    match.error = outcome[1]
    match.isFetching = false
    abortMatches(lane.matches, index + 1)
    lane.matches.length = index + 1
    return { status: 500, boundary: index, kind: ERROR }
  }

  const boundary = getNotFoundBoundary(router, lane.matches, indexed)
  const match = lane.matches[boundary]!
  const cause = outcome[1] as NotFoundError
  cause.routeId = match.routeId
  match.globalNotFound = undefined
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
  return { status: 404, boundary, kind: NOT_FOUND }
}

async function loadNormalChunks(
  router: AnyRouter,
  lane: ContextualizedLane,
  end: number,
): Promise<IndexedOutcome | undefined> {
  const chunks = lane.matches.map(async (match, index) => {
    if (index >= end || match.ssr !== true || match.status !== 'success') {
      return undefined
    }
    const route = getRoute(router, match)
    try {
      await loadRouteChunk(route)
    } catch (cause) {
      return [
        index,
        stampNotFound(match, normalizeError(route, cause)),
      ] as IndexedOutcome
    }
    return undefined
  })
  for (const chunk of chunks) {
    const indexed = await chunk
    if (indexed) {
      return indexed
    }
  }
  return undefined
}

async function projectLane(
  router: AnyRouter,
  lane: ReducedLane,
): Promise<void> {
  for (const match of lane.matches) {
    const routeOptions = getRoute(router, match).options
    if (
      match.ssr !== true ||
      (!routeOptions.head && !routeOptions.scripts && !routeOptions.headers)
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
    try {
      const [head, scripts, headers] = await Promise.all([
        routeOptions.head?.(context),
        routeOptions.scripts?.(context),
        routeOptions.headers?.(context),
      ])
      match.meta = head?.meta
      match.links = head?.links
      match.headScripts = head?.scripts
      match.styles = head?.styles
      match.scripts = scripts
      match.headers = headers
    } catch (cause) {
      console.error(cause)
    }
  }
}

async function executeServerLane(
  router: AnyRouter,
  location: ParsedLocation,
  matchedMatches: Array<AnyRouteMatch>,
): Promise<ServerLoadResult> {
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
  const lane = await contextualize(router, matched)

  let loaderEnd = lane.end
  if (lane.failure?.[1][0] === REDIRECTED) {
    loaderEnd = 0
  } else if (lane.failure?.[1][0] === NOT_FOUND) {
    loaderEnd = Math.min(
      loaderEnd,
      getNotFoundBoundary(router, lane.matches, lane.failure) + 1,
    )
  }

  const tasks: Array<LoaderTask> = []
  for (let index = 0; index < loaderEnd; index++) {
    const task = createLoaderTask(router, lane, index, tasks)
    tasks.push(task)
  }

  let loaderFailure: IndexedOutcome | undefined
  let control = lane.failure?.[1][0] === REDIRECTED ? lane.failure : undefined
  for (const task of tasks) {
    const outcome = await task.outcome
    if (outcome[0] === SUCCESS) {
      const match = lane.matches[task.index]!
      match.loaderData = outcome[1]
      match.status = 'success'
      match.error = undefined
      match.invalid = false
      match.isFetching = false
      match.updatedAt = Date.now()
    } else if (outcome[0] === REDIRECTED) {
      control = [task.index, outcome]
      break
    } else if (outcome[0] !== SKIPPED) {
      loaderFailure ??= [task.index, outcome]
    }
  }

  if (control?.[1][0] === REDIRECTED) {
    abortMatches(lane.matches)
    return resolveServerRedirect(router, location, control[1][1])
  }

  let failure = loaderFailure ?? lane.failure
  const plannedBoundary = lane.matches.findIndex(
    (match) => match.globalNotFound,
  )
  const readinessEnd = failure
    ? failure[1][0] === NOT_FOUND
      ? getNotFoundBoundary(router, lane.matches, failure)
      : failure[0]
    : plannedBoundary < 0
      ? lane.matches.length
      : plannedBoundary
  const chunkFailure = await loadNormalChunks(router, lane, readinessEnd)
  if (chunkFailure) {
    if (chunkFailure[1][0] === REDIRECTED) {
      abortMatches(lane.matches)
      return resolveServerRedirect(router, location, chunkFailure[1][1])
    }
    failure = chunkFailure
  }

  const terminal = applyFailure(router, lane, failure)
  if (terminal.boundary !== undefined) {
    const match = lane.matches[terminal.boundary]!
    if (match.ssr === true) {
      const route = getRoute(router, match)
      try {
        if (terminal.kind === ERROR) {
          await loadRouteChunk(route, 'errorComponent')
        } else if (match.globalNotFound) {
          await Promise.all([
            loadRouteChunk(route),
            loadRouteChunk(route, 'notFoundComponent'),
          ])
        } else {
          await loadRouteChunk(route, 'notFoundComponent')
        }
      } catch {}
    }
  }

  await projectLane(router, {
    location: lane.location,
    matches: lane.matches,
  } as ReducedLane)
  return { type: 'render', status: terminal.status, matches: lane.matches }
}

export async function loadServerRoute(
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
    const changeInfo = getLocationChangeInfo(next, fromLocation)
    router.emit({ type: 'onBeforeNavigate', ...changeInfo })
    router.emit({ type: 'onBeforeLoad', ...changeInfo })
    result = await executeServerLane(router, next, router.matchRoutes(next))
  } catch (cause) {
    if (!isRedirect(cause)) {
      throw cause
    }
    result = resolveServerRedirect(router, next, cause)
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
