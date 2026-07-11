import { isPromise } from './utils'
import { isNotFound } from './not-found'
import { rootRouteId } from './root'
import { isRedirect } from './redirect'
import { loadRouteChunk } from './route-chunks'
import { projectServerRouteAssets } from './route-assets.server'
import {
  commitMatch,
  getLoader,
  getMatchContext,
  getNotFoundBoundaryIndex,
  getNotFoundBoundaryPatch,
  normalizeRouteFailure,
  serialFailurePrefixCap,
} from './load-matches'
import type { NotFoundError } from './not-found'
import type {
  AnyRoute,
  BeforeLoadContextOptions,
  LoaderFnContext,
  SsrContextOptions,
} from './route'
import type { AnyRouteMatch, MakeRouteMatch } from './Matches'
import type { SSROption } from './router'
import type { InnerLoadContext, LoadMatchesArg } from './load-matches'

const handleServerRedirectOrNotFound = (
  inner: InnerLoadContext,
  index: number,
  err: unknown,
): void => {
  if (isRedirect(err)) {
    if (err.redirectHandled) {
      throw err
    }

    err.options._fromLocation = inner.location
    err.redirectHandled = true
    throw inner.router.resolveRedirect(err)
  }

  if (isNotFound(err)) {
    commitMatch(inner, index, {
      status: 'notFound',
      error: err,
    })
    throw err
  }
}

const recordServerBeforeLoadFailure = (
  inner: InnerLoadContext,
  index: number,
  error: unknown,
): void => {
  const match = inner.matches[index]!
  error = normalizeRouteFailure(inner, index, error)
  match.__beforeLoadContext = undefined
  inner.serialFailure = [index, error]
}

const finalizeServerRouteFailure = async (
  inner: InnerLoadContext,
  index: number,
  error: unknown,
): Promise<void> => {
  const routesById = inner.router.routesById
  let errorIndex = index
  // Set when loading a boundary component (errorComponent/notFoundComponent)
  // chunk fails: that failure replaces the original one and commits directly
  // as an error — it must not recurse into another boundary chunk.
  let componentError = false

  try {
    if (isNotFound(error)) {
      errorIndex = getNotFoundBoundaryIndex(inner, error)
      await loadRouteChunk(
        routesById[inner.matches[errorIndex]!.routeId],
        'notFoundComponent',
      )
    } else if (!isRedirect(error)) {
      await loadRouteChunk(
        routesById[inner.matches[index]!.routeId],
        'errorComponent',
      )
    }
  } catch (chunkError) {
    error = chunkError
    componentError = true
  }

  if (!componentError) {
    handleServerRedirectOrNotFound(inner, index, error)
  }

  // single-call-site inline of the shared badIndex rule (byte-size)
  inner.badIndex = Math.min(inner.badIndex ?? errorIndex, errorIndex)
  commitMatch(inner, errorIndex, {
    error,
    status: 'error' as const,
    context: getMatchContext(
      inner,
      errorIndex,
      inner.matches[errorIndex]!.__beforeLoadContext,
    ),
    updatedAt: Date.now(),
  })
}

const runServerBeforeLoad = (
  inner: InnerLoadContext,
  index: number,
  route: AnyRoute,
): void | Promise<void | AnyRouteMatch> => {
  const match = inner.matches[index]!
  const { abortController } = match

  const serialError =
    match.paramsError !== undefined ? match.paramsError : match.searchError
  if (serialError !== undefined) {
    return recordServerBeforeLoadFailure(inner, index, serialError)
  }

  const beforeLoad = route.options.beforeLoad
  const commitBeforeLoad = (beforeLoadContext: any): void => {
    commitMatch(inner, index, {
      __beforeLoadContext: beforeLoadContext,
      context: getMatchContext(inner, index, beforeLoadContext),
    })
  }

  if (!beforeLoad) {
    commitBeforeLoad(undefined)
    return
  }

  const updateContext = (beforeLoadContext: any): void => {
    if (isRedirect(beforeLoadContext) || isNotFound(beforeLoadContext)) {
      return recordServerBeforeLoadFailure(inner, index, beforeLoadContext)
    }

    commitBeforeLoad(beforeLoadContext)
  }

  const context = getMatchContext(inner, index, undefined)
  const { search, params, cause } = match
  const beforeLoadFnContext = {
    search,
    abortController,
    params,
    preload: false,
    context,
    location: inner.location,
    navigate: (opts: any) =>
      inner.router.navigate({
        ...opts,
        _fromLocation: inner.location,
      }),
    buildLocation: inner.router.buildLocation,
    cause,
    matches: inner.matches,
    routeId: route.id,
    ...inner.router.options.additionalContext,
  } as BeforeLoadContextOptions<any, any, any, any, any, any, any, any, any>

  try {
    const beforeLoadContext = beforeLoad(beforeLoadFnContext)
    if (isPromise(beforeLoadContext)) {
      return beforeLoadContext.then(updateContext, (err) =>
        recordServerBeforeLoadFailure(inner, index, err),
      )
    }
    return updateContext(beforeLoadContext)
  } catch (err) {
    return recordServerBeforeLoadFailure(inner, index, err)
  }
}

const handleServerBeforeLoad = (
  inner: InnerLoadContext,
  index: number,
): false | void | Promise<false | void | AnyRouteMatch> => {
  const { routeId } = inner.matches[index]!
  const route = inner.router.routesById[routeId]!
  const existingMatch = inner.matches[index]!
  const parentMatch = inner.matches[index - 1]

  const queueServerBeforeLoad = ():
    | false
    | void
    | Promise<void | AnyRouteMatch> => {
    if (existingMatch.ssr === false) {
      return false
    }

    return runServerBeforeLoad(inner, index, route)
  }

  if (inner.router.isShell()) {
    existingMatch.ssr = route.id === rootRouteId
    return queueServerBeforeLoad()
  }

  if (parentMatch?.ssr === false) {
    existingMatch.ssr = false
    return false
  }

  const parentOverride = (tempSsr: SSROption) => {
    if (tempSsr === true && parentMatch?.ssr === 'data-only') {
      return 'data-only'
    }
    return tempSsr
  }

  const defaultSsr = inner.router.options.defaultSsr ?? true

  if (route.options.ssr === undefined) {
    existingMatch.ssr = parentOverride(defaultSsr)
    return queueServerBeforeLoad()
  }

  if (typeof route.options.ssr !== 'function') {
    existingMatch.ssr = parentOverride(route.options.ssr)
    return queueServerBeforeLoad()
  }

  const { search, params } = existingMatch
  const ssrFnContext: SsrContextOptions<any, any, any> = {
    search: makeMaybe(search, existingMatch.searchError),
    params: makeMaybe(params, existingMatch.paramsError),
    location: inner.location,
    matches: inner.matches.map((match) => ({
      index: match.index,
      pathname: match.pathname,
      fullPath: match.fullPath,
      staticData: match.staticData,
      id: match.id,
      routeId: match.routeId,
      search: makeMaybe(match.search, match.searchError),
      params: makeMaybe(match.params, match.paramsError),
      ssr: match.ssr,
    })),
  }

  const applySsr = (ssr: SSROption | undefined) => {
    existingMatch.ssr = parentOverride(ssr ?? defaultSsr)
    return queueServerBeforeLoad()
  }
  let tempSsr
  try {
    tempSsr = route.options.ssr(ssrFnContext)
  } catch (error) {
    recordServerBeforeLoadFailure(inner, index, error)
    return
  }
  return isPromise(tempSsr)
    ? tempSsr.then(
        // The package build's PromiseLike narrowing excludes the private
        // `false` serial-failure sentinel even though this function carries it.
        applySsr as any,
        (error) => {
          recordServerBeforeLoadFailure(inner, index, error)
        },
      )
    : applySsr(tempSsr)
}

const getServerLoaderContext = (
  inner: InnerLoadContext,
  matchPromises: Array<Promise<AnyRouteMatch>>,
  index: number,
  route: AnyRoute,
): LoaderFnContext => {
  const { params, loaderDeps, abortController, cause, context } =
    inner.matches[index]!

  return {
    params,
    deps: loaderDeps,
    preload: false,
    parentMatchPromise: matchPromises[index - 1] as any,
    abortController,
    context,
    location: inner.location,
    navigate: (opts: any) =>
      inner.router.navigate({
        ...opts,
        _fromLocation: inner.location,
      }),
    cause,
    route,
    ...inner.router.options.additionalContext,
  }
}

const finishServerSkippedMatch = (
  inner: InnerLoadContext,
  index: number,
): AnyRouteMatch => {
  commitMatch(inner, index, {
    context: getMatchContext(
      inner,
      index,
      inner.matches[index]!.__beforeLoadContext,
    ),
  })
  return inner.matches[index]!
}

const commitServerNotFoundBoundary = (
  inner: InnerLoadContext,
  err: NotFoundError,
): number => {
  const index = getNotFoundBoundaryIndex(inner, err)
  commitMatch(inner, index, getNotFoundBoundaryPatch(inner, index, err))
  return index
}

const loadServerRouteMatch = async (
  inner: InnerLoadContext,
  matchPromises: Array<Promise<AnyRouteMatch>>,
  index: number,
): Promise<AnyRouteMatch> => {
  const initialMatch = inner.matches[index]!
  const { routeId } = initialMatch
  const route = inner.router.routesById[routeId]!
  const loader = getLoader(route.options.loader)

  const routeChunkPromise =
    initialMatch.ssr === true ? loadRouteChunk(route) : undefined
  void routeChunkPromise?.catch(() => {})

  try {
    const loaderResult = loader?.(
      getServerLoaderContext(inner, matchPromises, index, route),
    )
    const loaderResultIsPromise = isPromise(loaderResult)

    if (loader) {
      const loaderData = loaderResultIsPromise
        ? await loaderResult
        : loaderResult

      if (isRedirect(loaderData) || isNotFound(loaderData)) {
        throw loaderData
      }

      commitMatch(inner, index, {
        loaderData,
      })
    }
  } catch (loaderError) {
    if (isRedirect(loaderError) && loaderError.redirectHandled) {
      throw loaderError
    }

    if ((loaderError as any)?.name === 'AbortError') {
      // A loader's own AbortError (e.g. an internal fetch timeout) is not a
      // route failure: settle the match without committing an error instead
      // of turning the abort into a 500. If the match's own signal was
      // aborted, leave the match as-is.
      if (!inner.matches[index]!.abortController.signal.aborted) {
        commitMatch(inner, index, {
          status:
            inner.matches[index]!.status === 'pending'
              ? 'success'
              : inner.matches[index]!.status,
          context: getMatchContext(
            inner,
            index,
            inner.matches[index]!.__beforeLoadContext,
          ),
        })
      }
      return inner.matches[index]!
    }

    await finalizeServerRouteFailure(
      inner,
      index,
      normalizeRouteFailure(inner, index, loaderError),
    )
    return inner.matches[index]!
  }

  try {
    if (routeChunkPromise) {
      await routeChunkPromise
    }
  } catch (chunkError) {
    // A primary route chunk failure goes through the normal route failure
    // lifecycle (onError, redirect/notFound conversion) like loader
    // failures. Only a subsequent boundary component chunk failure commits
    // directly inside finalizeServerRouteFailure instead of recursing into
    // another boundary chunk.
    await finalizeServerRouteFailure(
      inner,
      index,
      normalizeRouteFailure(inner, index, chunkError),
    )
    return inner.matches[index]!
  }

  commitMatch(inner, index, {
    error: undefined,
    status: 'success',
    updatedAt: Date.now(),
  })

  return inner.matches[index]!
}

export const loadServerMatches = async (
  arg: LoadMatchesArg,
): Promise<Array<MakeRouteMatch>> => {
  // The server pipeline is request-local: preload, background, and pending
  // publication are client-side semantics and are deliberately not copied.
  const inner: InnerLoadContext = {
    router: arg.router,
    location: arg.location,
    matches: arg.matches,
  }
  const matchPromises: Array<Promise<AnyRouteMatch>> = []

  let firstNotFound: NotFoundError | undefined

  for (let i = 0; i < inner.matches.length && !inner.serialFailure; i++) {
    try {
      let beforeLoadResult:
        | false
        | void
        | AnyRouteMatch
        | Promise<false | void | AnyRouteMatch> = handleServerBeforeLoad(
        inner,
        i,
      )
      if (isPromise(beforeLoadResult)) {
        beforeLoadResult = await beforeLoadResult
      }
      if (beforeLoadResult === false) {
        matchPromises[i] = Promise.resolve(finishServerSkippedMatch(inner, i))
      }
    } catch (err) {
      if (!isNotFound(err)) {
        throw err
      }
      // An `ssr()` option can throw notFound(). Record it as the pass's
      // serial failure so the loader prefix is capped at the selected
      // boundary — the throwing route and descendants whose beforeLoad
      // never ran must not load.
      recordServerBeforeLoadFailure(inner, i, err)
      break
    }
  }

  const failure = inner.serialFailure
  const maxIndexExclusive = failure
    ? serialFailurePrefixCap(inner, failure)
    : inner.matches.length

  for (let i = 0; i < maxIndexExclusive; i++) {
    matchPromises[i] ||= loadServerRouteMatch(inner, matchPromises, i)
  }

  if (failure) {
    const [index, error] = failure
    matchPromises.push(finalizeServerRouteFailure(inner, index, error) as any)
  }

  let firstRedirect: unknown
  let fatalError: unknown
  let hasFatalError = false

  for (const result of await Promise.allSettled(matchPromises)) {
    if (result.status === 'fulfilled') {
      continue
    }
    const reason =
      process.env.NODE_ENV !== 'production' && result.reason === undefined
        ? new Error('Route load failed with undefined')
        : result.reason
    if (isRedirect(reason)) {
      firstRedirect ||= reason
    } else if (isNotFound(reason)) {
      firstNotFound ||= reason
    } else if (!hasFatalError) {
      fatalError = reason
      hasFatalError = true
    }
  }

  if (firstRedirect) {
    for (const match of inner.matches) {
      match.abortController.abort()
    }
    throw firstRedirect
  }

  const notFoundToThrow = firstNotFound
  const errorIndex = inner.badIndex
  let notFoundWins = false

  if (!hasFatalError && notFoundToThrow) {
    const index = getNotFoundBoundaryIndex(inner, notFoundToThrow)
    // A regular error already committed at an equal or shallower route owns
    // the render boundary. A deeper concurrent notFound must not overwrite
    // that error or make the server return 404 for UI that renders as 500.
    if (errorIndex == null || index < errorIndex) {
      commitServerNotFoundBoundary(inner, notFoundToThrow)
      notFoundWins = true
    }
    const trimIndex = notFoundWins ? index : errorIndex!
    while (inner.matches.length > trimIndex + 1) {
      inner.matches.pop()!.abortController.abort()
    }
  } else if (!hasFatalError) {
    while (errorIndex != null && inner.matches.length > errorIndex + 1) {
      inner.matches.pop()!.abortController.abort()
    }
  }

  const assets = projectServerRouteAssets(inner.router, inner.matches)

  if (isPromise(assets)) {
    await assets
  }

  if (hasFatalError) {
    throw fatalError
  }

  if (notFoundWins) {
    throw notFoundToThrow
  }

  if (errorIndex != null) {
    const errorMatch = inner.matches[errorIndex]!
    if (errorMatch.status === 'error') {
      throw errorMatch.error
    }
  }

  return inner.matches
}

function makeMaybe<TValue, TError>(
  value: TValue,
  error: TError,
): { status: 'success'; value: TValue } | { status: 'error'; error: TError } {
  if (error !== undefined) {
    return { status: 'error' as const, error }
  }
  return { status: 'success' as const, value }
}
