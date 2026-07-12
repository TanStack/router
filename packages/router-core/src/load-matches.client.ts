import { createControlledPromise, isPromise } from './utils'
import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import { loadRouteChunk } from './route-chunks'
import { projectClientRouteAssets } from './route-assets.client'
import {
  getMatchContext,
  getNotFoundBoundaryIndex,
  getNotFoundBoundaryPatch,
  markError,
  normalizeRouteFailure,
  settleMatchLoad,
} from './load-matches'
import type { NotFoundError } from './not-found'
import type {
  AnyRoute,
  BeforeLoadContextOptions,
  LoaderFnContext,
} from './route'
import type { AnyRouteMatch, MakeRouteMatch } from './Matches'
import type { AnyRouter } from './router'
import type { InnerLoadContext, SerialFailure } from './load-matches'

const isRouteControl = (error: unknown) =>
  isRedirect(error) || isNotFound(error)

const getLoader = (loaderOption: AnyRoute['options']['loader']) =>
  typeof loaderOption === 'function' ? loaderOption : loaderOption?.handler

// Route work may only commit while it still owns the lane entry it is about to
// mutate. Each client load pass stamps its matches with an AbortController:
// starting a newer load replaces the controller, cancellation aborts its signal,
// and a different pending public location means this pass no longer represents
// the browser target. Compare publicHref, not href, because href may be the
// router-internal path while publicHref includes basepath/rewrite output. Any
// of those cases makes continuing unsafe because stale beforeLoad/loader/chunk
// work could write into the current lane.
//
// Throwing `inner` is intentional. `loadClientMatches` catches that exact object
// as the private "lost ownership" sentinel, so abandoned work stops without
// becoming a user-visible route error or triggering route error handling.
const requireCurrentMatch = (
  inner: InnerLoadContext,
  index: number,
  abortController: AbortController,
): AnyRouteMatch => {
  const match = inner.matches[index]
  const pendingLocation = inner.router.pendingBuiltLocation
  if (
    !match ||
    match.abortController !== abortController ||
    abortController.signal.aborted ||
    (pendingLocation &&
      pendingLocation.publicHref !== inner.location.publicHref)
  ) {
    throw inner
  }

  return match
}

const commitMatch = (
  inner: InnerLoadContext,
  index: number,
  patch: Partial<AnyRouteMatch>,
): AnyRouteMatch => {
  return (inner.matches[index] = {
    ...inner.matches[index]!,
    ...patch,
  })
}

function getNavigate(inner: InnerLoadContext) {
  return (opts: any) =>
    inner.router.navigate({
      ...opts,
      _fromLocation: inner.location,
    })
}

const joinPreloadedActiveMatch = async (
  inner: InnerLoadContext,
  index: number,
): Promise<AnyRouteMatch> => {
  const matchId = inner.matches[index]!.id

  // A preload can reuse an active/pending match by ID, but it does not own that
  // match. If the foreground owner is already gone or aborted, this speculative
  // preload pass has nothing safe to borrow.
  let match = inner.router.getMatch(matchId, false)
  if (!match) {
    throw inner
  }
  if (match.abortController.signal.aborted) {
    throw inner
  }

  // Wait for the borrowed match's own beforeLoad/loader/component work to reach
  // a terminal render state before copying it into the private preload lane.
  if (match._.loadPromise?.status === 'pending') {
    await match._.loadPromise
  }

  // If the borrowed match still lives in the pending store, its local readiness
  // may have settled before the foreground load committed the lane. Wait for the
  // foreground load so the preload observes the committed owner, not a transient
  // pending-store snapshot.
  if (inner.router.stores.pendingMatchStores.has(matchId)) {
    await inner.router.latestLoadPromise
  }

  // Re-read after the waits because the owner may have committed, redirected,
  // disappeared, or been aborted while this preload was observing it.
  match = inner.router.getMatch(matchId, false)
  if (!match || match.abortController.signal.aborted) {
    throw inner
  }

  // From here the preload lane uses the owner match read-only. It must not clone
  // or cache a borrowed active match as if the preload generated it itself.
  inner.matches[index] = match
  const error = match._.error ?? match.error

  if (isRouteControl(error)) {
    // Borrowed active matches keep ownership of their route outcomes. Preloads
    // only observe the active lane; they must not chase a redirect/notFound that
    // the foreground navigation is already handling.
    throw inner
  }

  if (match.status !== 'success') {
    throw inner
  }

  return match
}

function waitPendingMin(match: AnyRouteMatch): Promise<void> | undefined {
  const remaining = (match._.loadPromise?.pendingUntil ?? 0) - Date.now()
  if (remaining > 0) {
    return new Promise<void>((resolve) => setTimeout(resolve, remaining))
  }
  return undefined
}

const finalizeRouteFailure = async (
  inner: InnerLoadContext,
  index: number,
  error: unknown,
  abortController: AbortController,
  componentFailure?: boolean,
): Promise<void> => {
  let errorIndex = index

  let currentMatch = requireCurrentMatch(inner, index, abortController)

  if (!componentFailure) {
    try {
      if (isNotFound(error)) {
        errorIndex = getNotFoundBoundaryIndex(inner, error)
        const boundaryMatch = inner.matches[errorIndex]!

        if (inner.preload?.includes(boundaryMatch.id)) {
          // The selected boundary is owned by an active/pending route match.
          // A speculative preload must not load its boundary component or mutate it.
          throw inner
        }
        await loadRouteChunk(
          inner.router.routesById[boundaryMatch.routeId],
          'notFoundComponent',
        )
      } else if (!isRedirect(error)) {
        await loadRouteChunk(
          inner.router.routesById[currentMatch.routeId],
          'errorComponent',
        )
      }
    } catch (chunkError) {
      if (chunkError === inner) {
        // Preserve the stale-pass sentinel from the borrowed-boundary branch;
        // it is not a component preload failure.
        throw inner
      }
      // This error already came from component/chunk loading, so commit it
      // directly instead of trying to load another boundary component.
      error = chunkError
      componentFailure = true
    }

    currentMatch = requireCurrentMatch(inner, index, abortController)
  }

  const pendingWait = waitPendingMin(currentMatch)
  if (pendingWait) {
    await pendingWait
    currentMatch = requireCurrentMatch(inner, index, abortController)
  }

  if (!componentFailure) {
    if (isRedirect(error)) {
      currentMatch._.error = error
      settleMatchLoad(currentMatch)

      error.options._fromLocation = inner.location
      // Redirects are terminal control flow for this pass, not renderable match
      // state. Throw the resolved redirect so navigation can take over.
      throw inner.router.resolveRedirect(error)
    }

    if (isNotFound(error)) {
      inner.requiresCommit = true

      commitMatch(inner, index, {
        status: 'notFound',
        error,
        isFetching: false,
      })

      // notFound is also terminal for this phase. The later allSettled reduction
      // chooses the render boundary and trims the final lane.
      throw error
    }
  }

  const matchToCommit = inner.matches[errorIndex]
  if (!matchToCommit) {
    // The lane was shortened by a newer outcome before this finalizer could
    // commit. Cancel this stale finalizer.
    throw inner
  }

  inner.requiresCommit = true
  markError(inner, errorIndex)

  commitMatch(inner, errorIndex, {
    error,
    status: 'error' as const,
    isFetching: false as const,
    context: getMatchContext(
      inner,
      errorIndex,
      matchToCommit.__beforeLoadContext,
    ),
    updatedAt: Date.now(),
  })
  finishMatchLoad(inner, errorIndex)
}

const recordBeforeLoadFailure = (
  inner: InnerLoadContext,
  index: number,
  error: unknown,
): SerialFailure => {
  const abortController = inner.matches[index]!.abortController
  requireCurrentMatch(inner, index, abortController)
  error = normalizeRouteFailure(inner, index, error)
  requireCurrentMatch(inner, index, abortController).__beforeLoadContext =
    undefined

  return [index, error]
}

const setupPendingTimeout = (
  inner: InnerLoadContext,
  routeOptions: AnyRoute['options'],
  index: number,
  match: AnyRouteMatch,
): void => {
  const onReady = inner.onReady
  if (
    match.status === 'pending' &&
    onReady &&
    !inner.pendingPublished &&
    (routeOptions.pendingComponent ??
      (inner.router.options as any).defaultPendingComponent)
  ) {
    const pendingMs =
      routeOptions.pendingMs ?? inner.router.options.defaultPendingMs
    const promise = match._.loadPromise
    if (
      (pendingMs as number) < Infinity &&
      promise &&
      !promise.pendingTimeout
    ) {
      promise.pendingTimeout = setTimeout(() => {
        const current = inner.matches[index]
        if (
          !inner.pendingPublished &&
          current?._.loadPromise === promise &&
          current.status === 'pending'
        ) {
          // Publish the current render-ready lane so pending UI can render while
          // beforeLoad/loader work continues.
          inner.pendingPublished = true
          inner.rendered ||= onReady(inner.matches.slice()) ?? true
        }
      }, pendingMs)
    }
  }
}

const handleClientBeforeLoad = (
  inner: InnerLoadContext,
  index: number,
): void | SerialFailure | Promise<void | SerialFailure> => {
  const existingMatch = inner.matches[index]!

  const { preload, routeId } = existingMatch
  const routeOptions = inner.router.routesById[routeId]!.options
  const abortController = existingMatch.abortController
  const pending = () => {
    commitMatch(inner, index, {
      isFetching: 'beforeLoad',
      // Note: We intentionally don't update context here.
      // Context should only be updated after beforeLoad resolves to avoid
      // components seeing incomplete context during async beforeLoad execution.
    })
  }

  const serialError =
    existingMatch.paramsError !== undefined
      ? existingMatch.paramsError
      : existingMatch.searchError
  const beforeLoad = routeOptions.beforeLoad
  if (beforeLoad || routeOptions.loader || serialError !== undefined) {
    existingMatch._.loadPromise ||= createControlledPromise<void>()
  }

  if (serialError !== undefined) {
    pending()
    return recordBeforeLoadFailure(inner, index, serialError)
  }

  setupPendingTimeout(inner, routeOptions, index, existingMatch)

  const commitBeforeLoad = (beforeLoadContext: any) => {
    commitMatch(inner, index, {
      isFetching: false as const,
      __beforeLoadContext: beforeLoadContext,
      context: getMatchContext(inner, index, beforeLoadContext),
    })
  }

  // Routes without beforeLoad still need to pick up parent beforeLoad context
  // before descendants run their loaders.
  if (!beforeLoad) {
    commitBeforeLoad(undefined)
    return
  }

  // commits the result of the beforeLoad phase and settles its promise
  const updateContext = (beforeLoadContext: any): void | SerialFailure => {
    requireCurrentMatch(inner, index, abortController)

    if (isRouteControl(beforeLoadContext)) {
      return recordBeforeLoadFailure(inner, index, beforeLoadContext)
    }

    commitBeforeLoad(beforeLoadContext)
  }

  // Exclude the current beforeLoad context while invoking beforeLoad for this generation.
  const context = getMatchContext(inner, index, undefined)
  const { search, params, cause } = existingMatch
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
    navigate: getNavigate(inner),
    buildLocation: inner.router.buildLocation,
    cause,
    matches: inner.matches,
    routeId,
    ...inner.router.options.additionalContext,
  }

  let beforeLoadContext
  try {
    requireCurrentMatch(inner, index, abortController)
    beforeLoadContext = beforeLoad(beforeLoadFnContext)
    if (isPromise(beforeLoadContext)) {
      requireCurrentMatch(inner, index, abortController)
      pending()
      return beforeLoadContext.then(updateContext, (err) => {
        requireCurrentMatch(inner, index, abortController)
        return recordBeforeLoadFailure(inner, index, err)
      })
    }
  } catch (err) {
    if (err === inner) {
      throw err
    }

    pending()
    return recordBeforeLoadFailure(inner, index, err)
  }

  return updateContext(beforeLoadContext)
}

const getLoaderContext = (
  inner: InnerLoadContext,
  matchPromises: Array<Promise<AnyRouteMatch>>,
  index: number,
  route: AnyRoute,
): LoaderFnContext => {
  const { params, loaderDeps, abortController, cause, context, preload } =
    inner.matches[index]!

  return {
    params,
    deps: loaderDeps,
    preload,
    parentMatchPromise: matchPromises[index - 1] as any,
    abortController,
    context,
    location: inner.location,
    navigate: getNavigate(inner),
    cause,
    route,
    ...inner.router.options.additionalContext,
  }
}

const finishMatchLoad = (
  inner: InnerLoadContext,
  index: number,
): AnyRouteMatch => {
  const match = inner.matches[index]!

  match._.dehydrated = undefined
  settleMatchLoad(match)

  return match.isFetching || match.invalid
    ? commitMatch(inner, index, {
        isFetching: false,
        invalid: false,
      })
    : match
}

const loadClientRouteMatch = async (
  inner: InnerLoadContext,
  matchPromises: Array<Promise<AnyRouteMatch>>,
  index: number,
): Promise<AnyRouteMatch> => {
  const { router, matches } = inner
  const initialMatch = matches[index]!
  const { routeId } = initialMatch
  const route = router.routesById[routeId]!
  const routeOptions = route.options
  const loaderOption = routeOptions.loader
  const loader = getLoader(loaderOption)

  let match = initialMatch
  const { preload } = match

  if (match._.dehydrated) {
    commitMatch(inner, index, {
      invalid: false,
      context: getMatchContext(inner, index, match.__beforeLoadContext),
    })

    // Hydrated client matches are already loaded. Finish by clearing stale
    // fetching/invalid flags and resolving their load promises.
    return finishMatchLoad(inner, index)
  }

  if (preload && routeOptions.preload === false) {
    // Route-level preload opt-out still needs promise cleanup for the lane entry.
    return finishMatchLoad(inner, index)
  }

  const passController = match.abortController

  if (match.status === 'success') {
    const activeMatch = router.stores.matches.get()[index]
    const staleAge = preload
      ? (routeOptions.preloadStaleTime ??
        router.options.defaultPreloadStaleTime ??
        30_000) // 30 seconds for preloads by default
      : (routeOptions.staleTime ?? router.options.defaultStaleTime ?? 0)
    const shouldReloadOption = routeOptions.shouldReload
    let shouldReload = shouldReloadOption
    if (typeof shouldReloadOption === 'function') {
      try {
        requireCurrentMatch(inner, index, passController)
        shouldReload = shouldReloadOption(
          getLoaderContext(inner, matchPromises, index, route),
        )
      } catch (err) {
        requireCurrentMatch(inner, index, passController)
        // shouldReload runs inside the route outcome lifecycle. If it throws,
        // commit that failure like a loader error and return the finalized lane.
        await finalizeRouteFailure(
          inner,
          index,
          normalizeRouteFailure(inner, index, err),
          passController,
        )
        return matches[index]!
      }
    }
    match = requireCurrentMatch(inner, index, passController)

    if (
      !match.invalid &&
      !(
        shouldReload ??
        (Date.now() - match.updatedAt >= staleAge &&
          (inner.forceStaleReload ||
            match.cause !== 'stay' ||
            (activeMatch &&
              activeMatch.routeId === routeId &&
              activeMatch.id !== match.id)))
      )
    ) {
      // Fresh enough, not invalid, and shouldReload did not request work: settle
      // the match without creating a loader generation.
      return finishMatchLoad(inner, index)
    }

    if (
      loader &&
      inner.background &&
      (loaderOption?.staleReloadMode ??
        router.options.defaultStaleReloadMode) !== 'blocking'
    ) {
      inner.background.push(index)
      return finishMatchLoad(inner, index)
    }
  }

  if (loader || match.status === 'pending' || match.invalid) {
    inner.requiresCommit = true
  }

  await (async (): Promise<void> => {
    const routeChunkPromise = loadRouteChunk(route)
    void routeChunkPromise?.catch(() => {})

    // Actually run the loader and handle the result
    try {
      // Kick off the loader!
      const loaderResult = loader?.(
        getLoaderContext(inner, matchPromises, index, route),
      )
      const loaderResultIsPromise = isPromise(loaderResult)
      if (loaderResultIsPromise || routeChunkPromise) {
        commitMatch(inner, index, {
          isFetching: 'loader',
        })
      }

      if (loader) {
        const loaderData = loaderResultIsPromise
          ? await loaderResult
          : loaderResult

        requireCurrentMatch(inner, index, passController)

        if (isRouteControl(loaderData)) {
          throw loaderData
        }

        commitMatch(inner, index, {
          loaderData,
        })
      }
    } catch (error) {
      if (error === inner) {
        // `inner` is cancellation. Re-throw it instead of wrapping it as a
        // route error.
        throw error
      }

      if (
        (error as any)?.name === 'AbortError' &&
        requireCurrentMatch(inner, index, passController).status !== 'pending'
      ) {
        // The route already has a renderable result, so an AbortError here is
        // a stale-while-revalidate abort. Clear fetching/invalid state and
        // settle readiness without turning the abort into a route error.
        finishMatchLoad(inner, index)
        return
      } else if (preload && isRedirect(error)) {
        settleMatchLoad(match)
        throw error
      }

      // Pending AbortErrors have no previous loaderData to keep, so they share
      // the normal route-error finalization path with other loader failures.
      requireCurrentMatch(inner, index, passController)
      return finalizeRouteFailure(
        inner,
        index,
        normalizeRouteFailure(inner, index, error),
        passController,
      )
    }

    try {
      if (routeChunkPromise) {
        await routeChunkPromise
      }
    } catch (chunkError) {
      // A route/component chunk failure replaces the loader result and is committed
      // as the route error for this loader generation.
      return finalizeRouteFailure(
        inner,
        index,
        chunkError,
        passController,
        true,
      )
    }

    const pendingWait = waitPendingMin(
      requireCurrentMatch(inner, index, passController),
    )
    if (pendingWait) {
      await pendingWait
      requireCurrentMatch(inner, index, passController)
    }

    commitMatch(inner, index, {
      error: undefined,
      status: 'success',
      isFetching: false,
      updatedAt: Date.now(),
    })
    finishMatchLoad(inner, index)
  })().catch((error) => {
    if (error === inner) {
      settleMatchLoad(match)
    }
    throw error
  })

  requireCurrentMatch(inner, index, passController)

  return matches[index]!
}

export const clearBackgroundFetching = (router: AnyRouter): void => {
  router.batch(() => {
    for (const matchId of router.stores.matchesId.get()) {
      router.updateMatch(matchId, (match) =>
        match.isFetching
          ? {
              ...match,
              isFetching: false,
            }
          : match,
      )
    }
  })
}

export function startBackgroundLoad(
  router: AnyRouter,
  location: InnerLoadContext['location'],
  base: Array<AnyRouteMatch>,
  indices: Array<number>,
): void {
  router._backgroundLoad?.controller.abort()
  const token = (router._backgroundLoad = {
    href: location.href,
    controller: new AbortController(),
  })

  const matches = base.slice()
  let committed = false
  const cancelBatch = () => {
    token.controller.abort()
  }
  const isCurrent = () =>
    router._backgroundLoad === token &&
    !token.controller.signal.aborted &&
    router.stores.location.get().href === token.href &&
    !router.pendingBuiltLocation
  const isCurrentOrCancel = () => {
    if (isCurrent()) {
      return true
    }
    cancelBatch()
    return false
  }
  const requireCurrent = () => {
    if (!isCurrent()) {
      throw token
    }
  }

  router.batch(() => {
    for (let i = 0; i < base.length; i++) {
      const match = base[i]!
      const isFetching = indices.includes(i) ? 'loader' : false
      router.updateMatch(match.id, (previous) =>
        previous.isFetching === isFetching
          ? previous
          : {
              ...previous,
              isFetching,
            },
      )
    }
  })

  const inner: InnerLoadContext = {
    router,
    location,
    matches,
  }

  void (async (): Promise<void> => {
    const matchPromises = matches.map((match) => Promise.resolve(match))
    // Sparse entries preserve `throw undefined`: a missing index means no
    // failure, while an own index with value `undefined` is still a failure.
    const failures: Array<unknown> = []

    for (const index of indices) {
      let match = (matches[index] = {
        ...base[index]!,
        abortController: token.controller,
      })

      matchPromises[index] = (async (): Promise<AnyRouteMatch> => {
        const route = router.routesById[match.routeId]!
        const loader = getLoader(route.options.loader)!

        try {
          requireCurrent()
          let loaderData = loader(
            getLoaderContext(inner, matchPromises, index, route),
          )
          requireCurrent()
          if (isPromise(loaderData)) {
            loaderData = await loaderData
            requireCurrent()
          }

          if (isRouteControl(loaderData)) {
            throw loaderData
          }

          match = {
            ...match,
            loaderData,
          }
        } catch (error) {
          if (error === token) {
            throw error
          }

          requireCurrent()
          if ((error as any)?.name === 'AbortError') {
            return match
          }

          // eslint-disable-next-line no-ex-assign
          error = normalizeRouteFailure(inner, index, error)
          requireCurrent()
          throw error
        }

        requireCurrent()
        return (matches[index] = {
          ...match,
          isFetching: false,
          updatedAt: Date.now(),
        })
      })().catch((error) => {
        if (error === token) {
          cancelBatch()
        } else {
          failures[index] = error
        }
        return matches[index]!
      })
    }

    await Promise.all(matchPromises)

    if (!isCurrentOrCancel()) {
      return
    }

    let redirectError: unknown
    let notFoundError: NotFoundError | undefined
    let failure: [number, unknown] | undefined

    for (let index = 0; index < failures.length; index++) {
      if (!(index in failures)) {
        continue
      }
      const error = failures[index]

      if (isRedirect(error)) {
        redirectError ||= error
      } else if (isNotFound(error)) {
        notFoundError ||= error
      } else {
        failure ||= [index, error]
      }
    }

    if (redirectError) {
      if (isCurrent()) {
        void router.navigate({
          ...(redirectError as any).options,
          replace: true,
          ignoreBlocker: true,
        })
      }
      return
    }

    if (failure) {
      // eslint-disable-next-line prefer-const
      let [index, error] = failure
      try {
        requireCurrent()
        await loadRouteChunk(
          router.routesById[matches[index]!.routeId],
          'errorComponent',
        )
        requireCurrent()
      } catch (componentError) {
        if (componentError === token) {
          cancelBatch()
          return
        }
        if (!isCurrentOrCancel()) {
          return
        }
        error = componentError
      }

      matches[index] = {
        ...matches[index]!,
        error,
        status: 'error',
        isFetching: false,
        updatedAt: Date.now(),
      }
      matches.length = index + 1
    } else if (notFoundError) {
      const index = getNotFoundBoundaryIndex(inner, notFoundError)
      const match = matches[index]!
      try {
        requireCurrent()
        await loadRouteChunk(
          router.routesById[match.routeId],
          'notFoundComponent',
        )
        requireCurrent()
        matches[index] = {
          ...match,
          ...getNotFoundBoundaryPatch(inner, index, notFoundError),
          invalid: false,
        }
      } catch (componentError) {
        if (componentError === token) {
          cancelBatch()
          return
        }
        if (!isCurrentOrCancel()) {
          return
        }
        matches[index] = {
          ...matches[index]!,
          error: componentError,
          status: 'error',
          isFetching: false,
          updatedAt: Date.now(),
        }
      }
      matches.length = index + 1
    }

    const assets = projectClientRouteAssets(
      router,
      matches,
      undefined,
      isCurrentOrCancel,
    )
    if (isPromise(assets)) {
      await assets
    }

    if (isCurrentOrCancel()) {
      router.stores.setMatches(matches)
      committed = true
    }
  })().finally(() => {
    if (router._backgroundLoad === token) {
      router._backgroundLoad = undefined
      if (!committed) {
        clearBackgroundFetching(router)
      }
    }
  })
}

export async function loadClientMatches(
  inner: InnerLoadContext,
): Promise<Array<MakeRouteMatch>> {
  const matchPromises: Array<Promise<AnyRouteMatch>> = []

  let firstNotFound: NotFoundError | undefined
  let failure: SerialFailure | undefined

  for (
    let i = 0;
    i < inner.matches.length && !failure && inner.badIndex === undefined;
    i++
  ) {
    try {
      if (inner.preload?.includes(inner.matches[i]!.id)) {
        await (matchPromises[i] = joinPreloadedActiveMatch(inner, i))
        continue
      }

      if (inner.matches[i]!._.dehydrated) {
        matchPromises[i] = loadClientRouteMatch(inner, matchPromises, i)
        continue
      }

      const beforeLoadResult = handleClientBeforeLoad(inner, i)
      if (isPromise(beforeLoadResult)) {
        failure = (await beforeLoadResult) as SerialFailure | undefined
      } else {
        failure = beforeLoadResult as SerialFailure | undefined
      }
    } catch (err) {
      if (err === inner) {
        // This pass lost ownership before serial loading reached a route outcome.
        throw err
      }
      if (isNotFound(err)) {
        firstNotFound ||= err
      } else if (isRedirect(err) || !inner.preload) {
        throw err
      }
      break
    }
  }

  let maxIndexExclusive = inner.badIndex ?? inner.matches.length
  if (failure) {
    const [index, error] = failure
    maxIndexExclusive = Math.min(
      maxIndexExclusive,
      isRedirect(error)
        ? 0
        : isNotFound(error)
          ? Math.min(getNotFoundBoundaryIndex(inner, error) + 1, index)
          : index,
    )
  }

  const background = inner.background
  if (failure) {
    // A serial failure is part of the foreground render lane. Retained
    // ancestors must honor shouldReload/staleTime in that lane instead of
    // being deferred into background work that may be discarded by the boundary.
    inner.background = undefined
  }
  for (let i = 0; i < maxIndexExclusive; i++) {
    matchPromises[i] ||= loadClientRouteMatch(inner, matchPromises, i)
  }
  inner.background = background

  if (failure) {
    const [index, error] = failure
    matchPromises.push(
      finalizeRouteFailure(
        inner,
        index,
        error,
        inner.matches[index]!.abortController,
      ) as any,
    )
  }

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
    if (reason === inner) {
      // `inner` means "this pass lost ownership". Stop reducing outcomes and
      // leave the current lane untouched for the newer owner.
      throw reason
    }
    if (isRedirect(reason)) {
      // Redirects outrank notFound and regular errors; let navigation handle it.
      throw reason
    } else if (isNotFound(reason)) {
      firstNotFound ||= reason
    } else if (!hasFatalError) {
      fatalError = reason
      hasFatalError = true
    }
  }

  if (hasFatalError) {
    // Non-route-control failures are fatal to this load call.
    throw fatalError
  }

  const errorIndex = inner.badIndex

  if (firstNotFound) {
    // Determine once which matched route will actually render the
    // notFoundComponent, then pass this precomputed index through the remaining
    // finalization steps.
    // This can differ from the throwing route when routeId targets an ancestor
    // boundary (or when bubbling resolves to a parent/root boundary).
    const index = getNotFoundBoundaryIndex(inner, firstNotFound)
    if (inner.preload?.includes(inner.matches[index]!.id)) {
      return inner.matches
    }

    const patch = getNotFoundBoundaryPatch(inner, index, firstNotFound)
    commitMatch(inner, index, patch)
    finishMatchLoad(inner, index)
    while (inner.matches.length > index + 1) {
      settleMatchLoad(inner.matches.pop()!)
    }
  } else if (errorIndex !== undefined) {
    while (inner.matches.length > errorIndex + 1) {
      settleMatchLoad(inner.matches.pop()!)
    }
  }

  if (inner.rendered && inner.rendered !== true) {
    await inner.rendered
  }

  if (firstNotFound) {
    throw firstNotFound
  }

  return inner.matches
}
