import invariant from 'tiny-invariant'
import { isServer } from '@tanstack/router-core/isServer'
import { batch } from './utils/batch'
import { createControlledPromise, isPromise } from './utils'
import { isNotFound } from './not-found'
import { rootRouteId } from './root'
import { isRedirect } from './redirect'
import type { NotFoundError } from './not-found'
import type { ParsedLocation } from './location'
import type {
  AnyRoute,
  BeforeLoadContextOptions,
  LoaderFnContext,
  SsrContextOptions,
} from './route'
import type { AnyRouteMatch, MakeRouteMatch } from './Matches'
import type { AnyRouter, SSROption, UpdateMatchFn } from './router'

/**
 * An object of this shape is created when calling `loadMatches`.
 * It contains everything we need for all other functions in this file
 * to work. (It's basically the function's argument, plus a few mutable states)
 */
type InnerLoadContext = {
  /** the calling router instance */
  router: AnyRouter
  location: ParsedLocation
  /** mutable state, scoped to a `loadMatches` call */
  firstBadMatchIndex?: number
  /** mutable state, scoped to a `loadMatches` call */
  rendered?: boolean
  updateMatch: UpdateMatchFn
  matches: Array<AnyRouteMatch>
  preload?: boolean
  onReady?: () => Promise<void>
  sync?: boolean
  /** mutable state, scoped to a `loadMatches` call */
  matchPromises: Array<Promise<AnyRouteMatch>>
}

const triggerOnReady = (inner: InnerLoadContext): void | Promise<void> => {
  if (!inner.rendered) {
    inner.rendered = true
    return inner.onReady?.()
  }
}

const resolvePreload = (inner: InnerLoadContext, matchId: string): boolean => {
  return !!(
    inner.preload && !inner.router.state.matches.some((d) => d.id === matchId)
  )
}

/**
 * Builds the accumulated context from router options and all matches up to (and optionally including) the given index.
 * Merges __routeContext and __beforeLoadContext from each match.
 */
const buildMatchContext = (
  inner: InnerLoadContext,
  index: number,
  includeCurrentMatch: boolean = true,
): Record<string, unknown> => {
  const context: Record<string, unknown> = {
    ...(inner.router.options.context ?? {}),
  }
  const end = includeCurrentMatch ? index : index - 1
  for (let i = 0; i <= end; i++) {
    const innerMatch = inner.matches[i]
    if (!innerMatch) continue
    const m = inner.router.getMatch(innerMatch.id)
    if (!m) continue
    Object.assign(context, m.__routeContext, m.__beforeLoadContext)
  }
  return context
}

const _handleNotFound = (inner: InnerLoadContext, err: NotFoundError) => {
  // Find the route that should handle the not found error
  // First check if a specific route is requested to show the error
  const routeCursor =
    inner.router.routesById[err.routeId ?? ''] ?? inner.router.routeTree

  // Ensure a NotFoundComponent exists on the route
  if (
    !routeCursor.options.notFoundComponent &&
    (inner.router.options as any)?.defaultNotFoundComponent
  ) {
    routeCursor.options.notFoundComponent = (
      inner.router.options as any
    ).defaultNotFoundComponent
  }

  // Ensure we have a notFoundComponent
  invariant(
    routeCursor.options.notFoundComponent,
    'No notFoundComponent found. Please set a notFoundComponent on your route or provide a defaultNotFoundComponent to the router.',
  )

  // Find the match for this route
  const matchForRoute = inner.matches.find((m) => m.routeId === routeCursor.id)

  invariant(matchForRoute, 'Could not find match for route: ' + routeCursor.id)

  // Assign the error to the match - using non-null assertion since we've checked with invariant
  inner.updateMatch(matchForRoute.id, (prev) => ({
    ...prev,
    status: 'notFound',
    error: err,
    isFetching: false,
  }))

  if ((err as any).routerCode === 'BEFORE_LOAD' && routeCursor.parentRoute) {
    err.routeId = routeCursor.parentRoute.id
    _handleNotFound(inner, err)
  }
}

const handleRedirectAndNotFound = (
  inner: InnerLoadContext,
  match: AnyRouteMatch | undefined,
  err: unknown,
): void => {
  if (!isRedirect(err) && !isNotFound(err)) return

  if (isRedirect(err) && err.redirectHandled && !err.options.reloadDocument) {
    throw err
  }

  // in case of a redirecting match during preload, the match does not exist
  if (match) {
    match._nonReactive.beforeLoadPromise?.resolve()
    match._nonReactive.loaderPromise?.resolve()
    match._nonReactive.beforeLoadPromise = undefined
    match._nonReactive.loaderPromise = undefined

    const status = isRedirect(err) ? 'redirected' : 'notFound'

    match._nonReactive.error = err

    inner.updateMatch(match.id, (prev) => ({
      ...prev,
      status,
      context: buildMatchContext(inner, match.index),
      isFetching: false,
      error: err,
    }))

    if (isNotFound(err) && !err.routeId) {
      err.routeId = match.routeId
    }

    match._nonReactive.loadPromise?.resolve()
  }

  if (isRedirect(err)) {
    inner.rendered = true
    err.options._fromLocation = inner.location
    err.redirectHandled = true
    err = inner.router.resolveRedirect(err)
    throw err
  } else {
    _handleNotFound(inner, err)
    throw err
  }
}

const shouldSkipLoader = (
  inner: InnerLoadContext,
  matchId: string,
): boolean => {
  const match = inner.router.getMatch(matchId)!
  // upon hydration, we skip the loader if the match has been dehydrated on the server
  if (!(isServer ?? inner.router.isServer) && match._nonReactive.dehydrated) {
    return true
  }

  if ((isServer ?? inner.router.isServer) && match.ssr === false) {
    return true
  }

  return false
}

const handleSerialError = (
  inner: InnerLoadContext,
  index: number,
  err: any,
  routerCode: string,
): void => {
  const { id: matchId, routeId } = inner.matches[index]!
  const route = inner.router.looseRoutesById[routeId]!

  // Much like suspense, we use a promise here to know if
  // we've been outdated by a new loadMatches call and
  // should abort the current async operation
  if (err instanceof Promise) {
    throw err
  }

  err.routerCode = routerCode
  inner.firstBadMatchIndex ??= index
  handleRedirectAndNotFound(inner, inner.router.getMatch(matchId), err)

  try {
    route.options.onError?.(err)
  } catch (errorHandlerErr) {
    err = errorHandlerErr
    handleRedirectAndNotFound(inner, inner.router.getMatch(matchId), err)
  }

  inner.updateMatch(matchId, (prev) => {
    prev._nonReactive.beforeLoadPromise?.resolve()
    prev._nonReactive.beforeLoadPromise = undefined
    prev._nonReactive.loadPromise?.resolve()

    return {
      ...prev,
      error: err,
      status: 'error',
      isFetching: false,
      updatedAt: Date.now(),
      abortController: new AbortController(),
    }
  })
}

const isBeforeLoadSsr = (
  inner: InnerLoadContext,
  matchId: string,
  index: number,
  route: AnyRoute,
): void | Promise<void> => {
  const existingMatch = inner.router.getMatch(matchId)!
  const parentMatchId = inner.matches[index - 1]?.id
  const parentMatch = parentMatchId
    ? inner.router.getMatch(parentMatchId)!
    : undefined

  // in SPA mode, only SSR the root route
  if (inner.router.isShell()) {
    existingMatch.ssr = route.id === rootRouteId
    return
  }

  if (parentMatch?.ssr === false) {
    existingMatch.ssr = false
    return
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
    return
  }

  if (typeof route.options.ssr !== 'function') {
    existingMatch.ssr = parentOverride(route.options.ssr)
    return
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

  const tempSsr = route.options.ssr(ssrFnContext)
  if (isPromise(tempSsr)) {
    return tempSsr.then((ssr) => {
      existingMatch.ssr = parentOverride(ssr ?? defaultSsr)
    })
  }

  existingMatch.ssr = parentOverride(tempSsr ?? defaultSsr)
  return
}

const setupPendingTimeout = (
  inner: InnerLoadContext,
  matchId: string,
  route: AnyRoute,
  match: AnyRouteMatch,
): void => {
  if (match._nonReactive.pendingTimeout !== undefined) return

  const pendingMs =
    route.options.pendingMs ?? inner.router.options.defaultPendingMs
  const shouldPending = !!(
    inner.onReady &&
    !(isServer ?? inner.router.isServer) &&
    !resolvePreload(inner, matchId) &&
    (route.options.loader ||
      route.options.beforeLoad ||
      routeNeedsPreload(route)) &&
    typeof pendingMs === 'number' &&
    pendingMs !== Infinity &&
    (route.options.pendingComponent ??
      (inner.router.options as any)?.defaultPendingComponent)
  )

  if (shouldPending) {
    const pendingTimeout = setTimeout(() => {
      // Update the match and prematurely resolve the loadMatches promise so that
      // the pending component can start rendering
      triggerOnReady(inner)
    }, pendingMs)
    match._nonReactive.pendingTimeout = pendingTimeout
  }
}

const preBeforeLoadSetup = (
  inner: InnerLoadContext,
  matchId: string,
  route: AnyRoute,
): void | Promise<void> => {
  const existingMatch = inner.router.getMatch(matchId)!

  // If we are in the middle of a load, either of these will be present
  // (not to be confused with `loadPromise`, which is always defined)
  if (
    !existingMatch._nonReactive.beforeLoadPromise &&
    !existingMatch._nonReactive.loaderPromise
  )
    return

  setupPendingTimeout(inner, matchId, route, existingMatch)

  const then = () => {
    const match = inner.router.getMatch(matchId)!
    if (
      match.preload &&
      (match.status === 'redirected' || match.status === 'notFound')
    ) {
      handleRedirectAndNotFound(inner, match, match.error)
    }
  }

  // Wait for the previous beforeLoad to resolve before we continue
  return existingMatch._nonReactive.beforeLoadPromise
    ? existingMatch._nonReactive.beforeLoadPromise.then(then)
    : then()
}

const executeBeforeLoad = (
  inner: InnerLoadContext,
  matchId: string,
  index: number,
  route: AnyRoute,
): void | Promise<void> => {
  const match = inner.router.getMatch(matchId)!

  // explicitly capture the previous loadPromise
  const prevLoadPromise = match._nonReactive.loadPromise
  match._nonReactive.loadPromise = createControlledPromise<void>(() => {
    prevLoadPromise?.resolve()
  })

  const { paramsError, searchError } = match

  if (paramsError) {
    handleSerialError(inner, index, paramsError, 'PARSE_PARAMS')
  }

  if (searchError) {
    handleSerialError(inner, index, searchError, 'VALIDATE_SEARCH')
  }

  setupPendingTimeout(inner, matchId, route, match)

  const abortController = new AbortController()

  let isPending = false
  const pending = () => {
    if (isPending) return
    isPending = true
    inner.updateMatch(matchId, (prev) => ({
      ...prev,
      isFetching: 'beforeLoad',
      fetchCount: prev.fetchCount + 1,
      abortController,
      // Note: We intentionally don't update context here.
      // Context should only be updated after beforeLoad resolves to avoid
      // components seeing incomplete context during async beforeLoad execution.
    }))
  }

  const resolve = () => {
    match._nonReactive.beforeLoadPromise?.resolve()
    match._nonReactive.beforeLoadPromise = undefined
    inner.updateMatch(matchId, (prev) => ({
      ...prev,
      isFetching: false,
    }))
  }

  // if there is no `beforeLoad` option, just mark as pending and resolve
  // Context will be updated later in loadRouteMatch after loader completes
  if (!route.options.beforeLoad) {
    batch(() => {
      pending()
      resolve()
    })
    return
  }

  match._nonReactive.beforeLoadPromise = createControlledPromise<void>()

  // Build context from all parent matches, excluding current match's __beforeLoadContext
  // (since we're about to execute beforeLoad for this match)
  const context = {
    ...buildMatchContext(inner, index, false),
    ...match.__routeContext,
  }
  const { search, params, cause } = match
  const preload = resolvePreload(inner, matchId)
  const beforeLoadFnContext: BeforeLoadContextOptions<
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
    search,
    abortController,
    params,
    preload,
    context,
    location: inner.location,
    navigate: (opts: any) =>
      inner.router.navigate({
        ...opts,
        _fromLocation: inner.location,
      }),
    buildLocation: inner.router.buildLocation,
    cause: preload ? 'preload' : cause,
    matches: inner.matches,
    routeId: route.id,
    ...inner.router.options.additionalContext,
  }

  const updateContext = (beforeLoadContext: any) => {
    if (beforeLoadContext === undefined) {
      batch(() => {
        pending()
        resolve()
      })
      return
    }
    if (isRedirect(beforeLoadContext) || isNotFound(beforeLoadContext)) {
      pending()
      handleSerialError(inner, index, beforeLoadContext, 'BEFORE_LOAD')
    }

    batch(() => {
      pending()
      // Only store __beforeLoadContext here, don't update context yet
      // Context will be updated in loadRouteMatch after loader completes
      inner.updateMatch(matchId, (prev) => ({
        ...prev,
        __beforeLoadContext: beforeLoadContext,
      }))
      resolve()
    })
  }

  let beforeLoadContext
  try {
    beforeLoadContext = route.options.beforeLoad(beforeLoadFnContext)
    if (isPromise(beforeLoadContext)) {
      pending()
      return beforeLoadContext
        .catch((err) => {
          handleSerialError(inner, index, err, 'BEFORE_LOAD')
        })
        .then(updateContext)
    }
  } catch (err) {
    pending()
    handleSerialError(inner, index, err, 'BEFORE_LOAD')
  }

  updateContext(beforeLoadContext)
  return
}

const handleBeforeLoad = (
  inner: InnerLoadContext,
  index: number,
): void | Promise<void> => {
  const { id: matchId, routeId } = inner.matches[index]!
  const route = inner.router.looseRoutesById[routeId]!

  const serverSsr = () => {
    // on the server, determine whether SSR the current match or not
    if (isServer ?? inner.router.isServer) {
      const maybePromise = isBeforeLoadSsr(inner, matchId, index, route)
      if (isPromise(maybePromise)) return maybePromise.then(queueExecution)
    }
    return queueExecution()
  }

  const execute = () => executeBeforeLoad(inner, matchId, index, route)

  const queueExecution = () => {
    if (shouldSkipLoader(inner, matchId)) return
    const result = preBeforeLoadSetup(inner, matchId, route)
    return isPromise(result) ? result.then(execute) : execute()
  }

  return serverSsr()
}

const executeHead = (
  inner: InnerLoadContext,
  matchId: string,
  route: AnyRoute,
): void | Promise<
  Pick<
    AnyRouteMatch,
    'meta' | 'links' | 'headScripts' | 'headers' | 'scripts' | 'styles'
  >
> => {
  const match = inner.router.getMatch(matchId)
  // in case of a redirecting match during preload, the match does not exist
  if (!match) {
    return
  }
  if (!route.options.head && !route.options.scripts && !route.options.headers) {
    return
  }
  const assetContext = {
    ssr: inner.router.options.ssr,
    matches: inner.matches,
    match,
    params: match.params,
    loaderData: match.loaderData,
  }

  return Promise.all([
    route.options.head?.(assetContext),
    route.options.scripts?.(assetContext),
    route.options.headers?.(assetContext),
  ]).then(([headFnContent, scripts, headers]) => {
    const meta = headFnContent?.meta
    const links = headFnContent?.links
    const headScripts = headFnContent?.scripts
    const styles = headFnContent?.styles

    return {
      meta,
      links,
      headScripts,
      headers,
      scripts,
      styles,
    }
  })
}

const getLoaderContext = (
  inner: InnerLoadContext,
  matchId: string,
  index: number,
  route: AnyRoute,
): LoaderFnContext => {
  const parentMatchPromise = inner.matchPromises[index - 1] as any
  const { params, loaderDeps, abortController, cause } =
    inner.router.getMatch(matchId)!

  const context = buildMatchContext(inner, index)

  const preload = resolvePreload(inner, matchId)

  return {
    params,
    deps: loaderDeps,
    preload: !!preload,
    parentMatchPromise,
    abortController,
    context,
    location: inner.location,
    navigate: (opts) =>
      inner.router.navigate({
        ...opts,
        _fromLocation: inner.location,
      }),
    cause: preload ? 'preload' : cause,
    route,
    ...inner.router.options.additionalContext,
  }
}

const runLoader = async (
  inner: InnerLoadContext,
  matchId: string,
  index: number,
  route: AnyRoute,
): Promise<void> => {
  try {
    // If the Matches component rendered
    // the pending component and needs to show it for
    // a minimum duration, we''ll wait for it to resolve
    // before committing to the match and resolving
    // the loadPromise

    const match = inner.router.getMatch(matchId)!

    // Actually run the loader and handle the result
    try {
      if (!(isServer ?? inner.router.isServer) || match.ssr === true) {
        loadRouteChunk(route)
      }

      // Kick off the loader!
      const loaderResult = route.options.loader?.(
        getLoaderContext(inner, matchId, index, route),
      )
      const loaderResultIsPromise =
        route.options.loader && isPromise(loaderResult)

      const willLoadSomething = !!(
        loaderResultIsPromise ||
        route._lazyPromise ||
        route._componentsPromise ||
        route.options.head ||
        route.options.scripts ||
        route.options.headers ||
        match._nonReactive.minPendingPromise
      )

      if (willLoadSomething) {
        inner.updateMatch(matchId, (prev) => ({
          ...prev,
          isFetching: 'loader',
        }))
      }

      if (route.options.loader) {
        const loaderData = loaderResultIsPromise
          ? await loaderResult
          : loaderResult

        handleRedirectAndNotFound(
          inner,
          inner.router.getMatch(matchId),
          loaderData,
        )
        if (loaderData !== undefined) {
          inner.updateMatch(matchId, (prev) => ({
            ...prev,
            loaderData,
          }))
        }
      }

      // Lazy option can modify the route options,
      // so we need to wait for it to resolve before
      // we can use the options
      if (route._lazyPromise) await route._lazyPromise
      const pendingPromise = match._nonReactive.minPendingPromise
      if (pendingPromise) await pendingPromise

      // Last but not least, wait for the the components
      // to be preloaded before we resolve the match
      if (route._componentsPromise) await route._componentsPromise
      inner.updateMatch(matchId, (prev) => ({
        ...prev,
        error: undefined,
        context: buildMatchContext(inner, index),
        status: 'success',
        isFetching: false,
        updatedAt: Date.now(),
      }))
    } catch (e) {
      let error = e

      if ((error as any)?.name === 'AbortError') {
        if (match.abortController.signal.aborted) {
          match._nonReactive.loaderPromise?.resolve()
          match._nonReactive.loaderPromise = undefined
          return
        }
        inner.updateMatch(matchId, (prev) => ({
          ...prev,
          status: prev.status === 'pending' ? 'success' : prev.status,
          isFetching: false,
          context: buildMatchContext(inner, index),
        }))
        return
      }

      const pendingPromise = match._nonReactive.minPendingPromise
      if (pendingPromise) await pendingPromise

      if (isNotFound(e)) {
        await (route.options.notFoundComponent as any)?.preload?.()
      }

      handleRedirectAndNotFound(inner, inner.router.getMatch(matchId), e)

      try {
        route.options.onError?.(e)
      } catch (onErrorError) {
        error = onErrorError
        handleRedirectAndNotFound(
          inner,
          inner.router.getMatch(matchId),
          onErrorError,
        )
      }
      inner.updateMatch(matchId, (prev) => ({
        ...prev,
        error,
        context: buildMatchContext(inner, index),
        status: 'error',
        isFetching: false,
      }))
    }
  } catch (err) {
    const match = inner.router.getMatch(matchId)
    // in case of a redirecting match during preload, the match does not exist
    if (match) {
      match._nonReactive.loaderPromise = undefined
    }
    handleRedirectAndNotFound(inner, match, err)
  }
}

const loadRouteMatch = async (
  inner: InnerLoadContext,
  index: number,
): Promise<AnyRouteMatch> => {
  async function handleLoader(
    preload: boolean,
    prevMatch: AnyRouteMatch,
    match: AnyRouteMatch,
    route: AnyRoute,
  ) {
    const age = Date.now() - prevMatch.updatedAt

    const staleAge = preload
      ? (route.options.preloadStaleTime ??
        inner.router.options.defaultPreloadStaleTime ??
        30_000) // 30 seconds for preloads by default
      : (route.options.staleTime ?? inner.router.options.defaultStaleTime ?? 0)

    const shouldReloadOption = route.options.shouldReload

    // Default to reloading the route all the time
    // Allow shouldReload to get the last say,
    // if provided.
    const shouldReload =
      typeof shouldReloadOption === 'function'
        ? shouldReloadOption(getLoaderContext(inner, matchId, index, route))
        : shouldReloadOption

    // If the route is successful and still fresh, just resolve
    const { status, invalid } = match
    loaderShouldRunAsync =
      status === 'success' && (invalid || (shouldReload ?? age > staleAge))
    if (preload && route.options.preload === false) {
      // Do nothing
    } else if (loaderShouldRunAsync && !inner.sync) {
      loaderIsRunningAsync = true
      ;(async () => {
        try {
          await runLoader(inner, matchId, index, route)
          const match = inner.router.getMatch(matchId)!
          match._nonReactive.loaderPromise?.resolve()
          match._nonReactive.loadPromise?.resolve()
          match._nonReactive.loaderPromise = undefined
        } catch (err) {
          if (isRedirect(err)) {
            await inner.router.navigate(err.options)
          }
        }
      })()
    } else if (status !== 'success' || (loaderShouldRunAsync && inner.sync)) {
      await runLoader(inner, matchId, index, route)
    }
  }

  const { id: matchId, routeId } = inner.matches[index]!
  let loaderShouldRunAsync = false
  let loaderIsRunningAsync = false
  const route = inner.router.looseRoutesById[routeId]!

  if (shouldSkipLoader(inner, matchId)) {
    if (isServer ?? inner.router.isServer) {
      return inner.router.getMatch(matchId)!
    }
  } else {
    const prevMatch = inner.router.getMatch(matchId)! // This is where all of the stale-while-revalidate magic happens
    const preload = resolvePreload(inner, matchId)

    // there is a loaderPromise, so we are in the middle of a load
    if (prevMatch._nonReactive.loaderPromise) {
      // do not block if we already have stale data we can show
      // but only if the ongoing load is not a preload since error handling is different for preloads
      // and we don't want to swallow errors
      if (prevMatch.status === 'success' && !inner.sync && !prevMatch.preload) {
        return prevMatch
      }
      await prevMatch._nonReactive.loaderPromise
      const match = inner.router.getMatch(matchId)!
      const error = match._nonReactive.error || match.error
      if (error) {
        handleRedirectAndNotFound(inner, match, error)
      }

      if (match.status === 'pending') {
        await handleLoader(preload, prevMatch, match, route)
      }
    } else {
      const nextPreload =
        preload && !inner.router.state.matches.some((d) => d.id === matchId)
      const match = inner.router.getMatch(matchId)!
      match._nonReactive.loaderPromise = createControlledPromise<void>()
      if (nextPreload !== match.preload) {
        inner.updateMatch(matchId, (prev) => ({
          ...prev,
          preload: nextPreload,
        }))
      }

      await handleLoader(preload, prevMatch, match, route)
    }
  }
  const match = inner.router.getMatch(matchId)!
  if (!loaderIsRunningAsync) {
    match._nonReactive.loaderPromise?.resolve()
    match._nonReactive.loadPromise?.resolve()
  }

  clearTimeout(match._nonReactive.pendingTimeout)
  match._nonReactive.pendingTimeout = undefined
  if (!loaderIsRunningAsync) match._nonReactive.loaderPromise = undefined
  match._nonReactive.dehydrated = undefined

  const nextIsFetching = loaderIsRunningAsync ? match.isFetching : false
  if (nextIsFetching !== match.isFetching || match.invalid !== false) {
    inner.updateMatch(matchId, (prev) => ({
      ...prev,
      isFetching: nextIsFetching,
      invalid: false,
    }))
    return inner.router.getMatch(matchId)!
  } else {
    return match
  }
}

export async function loadMatches(arg: {
  router: AnyRouter
  location: ParsedLocation
  matches: Array<AnyRouteMatch>
  preload?: boolean
  onReady?: () => Promise<void>
  updateMatch: UpdateMatchFn
  sync?: boolean
}): Promise<Array<MakeRouteMatch>> {
  const inner: InnerLoadContext = Object.assign(arg, {
    matchPromises: [],
  })

  // make sure the pending component is immediately rendered when hydrating a match that is not SSRed
  // the pending component was already rendered on the server and we want to keep it shown on the client until minPendingMs is reached
  if (
    !(isServer ?? inner.router.isServer) &&
    inner.router.state.matches.some((d) => d._forcePending)
  ) {
    triggerOnReady(inner)
  }

  try {
    // Execute all beforeLoads one by one
    for (let i = 0; i < inner.matches.length; i++) {
      const beforeLoad = handleBeforeLoad(inner, i)
      if (isPromise(beforeLoad)) await beforeLoad
    }

    // Execute all loaders in parallel
    const max = inner.firstBadMatchIndex ?? inner.matches.length
    for (let i = 0; i < max; i++) {
      inner.matchPromises.push(loadRouteMatch(inner, i))
    }
    // Use allSettled to ensure all loaders complete regardless of success/failure
    const results = await Promise.allSettled(inner.matchPromises)

    const failures = results
      // TODO when we drop support for TS 5.4, we can use the built-in type guard for PromiseRejectedResult
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      )
      .map((result) => result.reason)

    // Find first redirect (throw immediately) or notFound (throw after head execution)
    let firstNotFound: unknown
    for (const err of failures) {
      if (isRedirect(err)) {
        throw err
      }
      if (!firstNotFound && isNotFound(err)) {
        firstNotFound = err
      }
    }

    // serially execute head functions after all loaders have completed (successfully or not)
    // Each head execution is wrapped in try-catch to ensure all heads run even if one fails
    for (const match of inner.matches) {
      const { id: matchId, routeId } = match
      const route = inner.router.looseRoutesById[routeId]!
      try {
        const headResult = executeHead(inner, matchId, route)
        if (headResult) {
          const head = await headResult
          inner.updateMatch(matchId, (prev) => ({
            ...prev,
            ...head,
          }))
        }
      } catch (err) {
        // Log error but continue executing other head functions
        console.error(`Error executing head for route ${routeId}:`, err)
      }
    }

    // Throw notFound after head execution
    if (firstNotFound) {
      throw firstNotFound
    }

    const readyPromise = triggerOnReady(inner)
    if (isPromise(readyPromise)) await readyPromise
  } catch (err) {
    if (isNotFound(err) && !inner.preload) {
      const readyPromise = triggerOnReady(inner)
      if (isPromise(readyPromise)) await readyPromise
      throw err
    }
    if (isRedirect(err)) {
      throw err
    }
  }
  return inner.matches
}

export async function loadRouteChunk(route: AnyRoute) {
  if (!route._lazyLoaded && route._lazyPromise === undefined) {
    if (route.lazyFn) {
      route._lazyPromise = route.lazyFn().then((lazyRoute) => {
        // explicitly don't copy over the lazy route's id
        const { id: _id, ...options } = lazyRoute.options
        Object.assign(route.options, options)
        route._lazyLoaded = true
        route._lazyPromise = undefined // gc promise, we won't need it anymore
      })
    } else {
      route._lazyLoaded = true
    }
  }

  // If for some reason lazy resolves more lazy components...
  // We'll wait for that before we attempt to preload the
  // components themselves.
  if (!route._componentsLoaded && route._componentsPromise === undefined) {
    const loadComponents = () => {
      const preloads = []
      for (const type of componentTypes) {
        const preload = (route.options[type] as any)?.preload
        if (preload) preloads.push(preload())
      }
      if (preloads.length)
        return Promise.all(preloads).then(() => {
          route._componentsLoaded = true
          route._componentsPromise = undefined // gc promise, we won't need it anymore
        })
      route._componentsLoaded = true
      route._componentsPromise = undefined // gc promise, we won't need it anymore
      return
    }
    route._componentsPromise = route._lazyPromise
      ? route._lazyPromise.then(loadComponents)
      : loadComponents()
  }
  return route._componentsPromise
}

function makeMaybe<TValue, TError>(
  value: TValue,
  error: TError,
): { status: 'success'; value: TValue } | { status: 'error'; error: TError } {
  if (error) {
    return { status: 'error' as const, error }
  }
  return { status: 'success' as const, value }
}

export function routeNeedsPreload(route: AnyRoute) {
  for (const componentType of componentTypes) {
    if ((route.options[componentType] as any)?.preload) {
      return true
    }
  }
  return false
}

export const componentTypes = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
] as const
