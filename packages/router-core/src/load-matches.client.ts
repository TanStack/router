import { createControlledPromise, isPromise } from './utils'
import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import { loadRouteChunk } from './route-chunks'
import { projectClientRouteAssets } from './route-assets.client'
import {
  commitMatch,
  getLoader,
  getMatchContext,
  getNotFoundBoundaryIndex,
  getNotFoundBoundaryPatch,
  normalizeRouteFailure,
  serialFailurePrefixCap,
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

// Route work may only commit while it still owns the lane entry it is about to
// mutate. Each client load pass stamps its matches with an AbortController:
// starting a newer load replaces the controller, and cancellation aborts its
// signal. Speculative (preload) passes additionally yield when a different
// public location is being built — compare publicHref, not href, because href
// may be the router-internal path while publicHref includes basepath/rewrite
// output. Foreground navigation passes must NOT treat a merely-built pending
// location as ownership loss: a history blocker can still discard that commit
// (so no replacement load would ever start), and true supersession is
// observed via the controller once the newer load runs cancelMatches. Any of
// those cases makes continuing unsafe because stale beforeLoad/loader/chunk
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
  const pendingLocation = inner.preload
    ? inner.router.pendingBuiltLocation
    : undefined
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
  // match. If the foreground owner is already gone, this speculative preload
  // pass has nothing safe to borrow. (An aborted owner is caught by the
  // re-read and check below.)
  let match = inner.router.getMatch(matchId, false)
  if (!match) {
    throw inner
  }

  // Wait for the borrowed match's own beforeLoad/loader/component work to reach
  // a terminal render state before copying it into the private preload lane.
  if (match._.loadPromise?.status === 'pending') {
    await match._.loadPromise
  }

  // The borrowed match's local readiness can settle before the foreground
  // load commits the lane: the owner may still sit in the pending store, or
  // be a render-ready pending publication (onReady() moved it into the
  // active store, clearing the pending pool, while the final commit is
  // still in flight — the snapshot is stuck at status 'pending' even though
  // its local work settled). Wait for the current foreground load exactly
  // once: if the owner still has not committed after that, a newer
  // navigation owns it, and this speculative pass yields (the final status
  // check below throws the ownership sentinel) instead of chasing churn.
  match = inner.router.getMatch(matchId, false)
  if (!match || match.abortController.signal.aborted) {
    throw inner
  }
  if (
    inner.router.latestLoadPromise &&
    (match.status === 'pending' ||
      inner.router.stores.pendingMatchStores.has(matchId))
  ) {
    await inner.router.latestLoadPromise

    match = inner.router.getMatch(matchId, false)
    if (!match || match.abortController.signal.aborted) {
      throw inner
    }
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

/**
 * The mirror of joinPreloadedActiveMatch: a navigation adopts an in-flight
 * private preload's SUCCESSFUL loader result instead of executing the loader
 * a second time. Only data is adopted — never control flow: a preload that
 * ended in redirect/notFound/error is ignored and the navigation runs its
 * own loader, so preload-flavored outcomes cannot leak into navigations.
 *
 * The donor is discovered here, at loader time, from the registered preload
 * lanes (or, for a preload that finished in the meantime, from its cache
 * entry) — the join point is discoverable state, not plumbing threaded
 * through match creation.
 *
 * Joining is gated on the donor's loader actually being IN FLIGHT
 * (isFetching === 'loader'): before that, the preload's serial phase may
 * itself be waiting on this navigation through the borrow protocol, and
 * joining would deadlock the pair. Once the donor's loader started, its
 * serial phase is over by construction and the pass settles independently.
 */
const adoptInFlightPreload = async (
  inner: InnerLoadContext,
  index: number,
  passController: AbortController,
): Promise<true | undefined> => {
  const match = inner.matches[index]!

  for (const lane of inner.router._preloadLanes!) {
    if (lane === inner) {
      continue
    }
    const readDonor = () =>
      lane.matches.find((m) => m.id === match.id && m.preload)
    let donor = readDonor()
    if (!donor) {
      continue
    }

    if (donor.status !== 'success') {
      if (
        donor.isFetching !== 'loader' ||
        donor._.loadPromise?.status !== 'pending'
      ) {
        // Not joinable (e.g. still in its serial phase) — a later registered
        // lane may hold the same match with its loader already in flight.
        continue
      }
      commitMatch(inner, index, { isFetching: 'loader' })
      // The preload pass settles every owned match's loadPromise in its
      // finally, so this wait cannot hang even for aborted preloads.
      await donor._.loadPromise
      requireCurrentMatch(inner, index, passController)
      donor = readDonor()
    }

    if (donor?.status !== 'success') {
      return undefined
    }
    commitMatch(inner, index, { loaderData: donor.loaderData })
    return true
  }

  // A preload that completes in the microtask window between matchRoutes
  // and this loader phase is simply not adopted — the navigation runs its
  // own loader, which is correct, just not deduplicated. Not worth a hedge.
  return undefined
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
): Promise<void> => {
  let errorIndex = index
  let componentFailure = false

  let currentMatch = requireCurrentMatch(inner, index, abortController)

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
      // No requiresCommit write here: this branch always throws, and
      // loadClientRouter's catch owns the flag for thrown outcomes.
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

  inner.requiresCommit = true
  // single-call-site inline of the shared badIndex rule (byte-size)
  inner.badIndex = Math.min(inner.badIndex ?? errorIndex, errorIndex)

  commitMatch(inner, errorIndex, {
    status: 'error' as const,
    error,
    isFetching: false as const,
    updatedAt: Date.now(),
    context: getMatchContext(
      inner,
      errorIndex,
      inner.matches[errorIndex]!.__beforeLoadContext,
    ),
  })
  finishMatchLoad(inner, errorIndex)
}

const recordBeforeLoadFailure = (
  inner: InnerLoadContext,
  index: number,
  abortController: AbortController,
  error: unknown,
): SerialFailure => {
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
    !inner.rendered &&
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
      const publish = () => {
        const current = inner.matches[index]
        if (
          !inner.rendered &&
          current?._.loadPromise === promise &&
          current.status === 'pending'
        ) {
          // Publish the current render-ready lane so pending UI can render while
          // beforeLoad/loader work continues.
          onReady(inner.matches.slice())
          inner.rendered = true
        }
      }

      if (
        (pendingMs as number) <= 0 &&
        inner.router.stores.matchesId.get().length === 0
      ) {
        // Nothing is rendered yet (bare initial load): deferring a
        // pendingMs-0 publication to a macrotask would let the browser
        // paint a blank frame before the fallback (#4759). Publish now.
        // When content IS displayed, the timer path stays preferable — a
        // later publication captures a fresher lane snapshot.
        publish()
      } else {
        promise.pendingTimeout = setTimeout(publish, pendingMs)
      }
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
    return recordBeforeLoadFailure(inner, index, abortController, serialError)
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
      return recordBeforeLoadFailure(
        inner,
        index,
        abortController,
        beforeLoadContext,
      )
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
      return beforeLoadContext.then(updateContext, (err) =>
        recordBeforeLoadFailure(inner, index, abortController, err),
      )
    }
  } catch (err) {
    if (err === inner) {
      throw err
    }

    pending()
    return recordBeforeLoadFailure(inner, index, abortController, err)
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

    // A serial failure is part of the foreground render lane. Retained
    // ancestors must honor shouldReload/staleTime in that lane instead of
    // being deferred into background work that may be discarded by the boundary.
    if (
      loader &&
      inner.background &&
      !inner.serialFailure &&
      (loaderOption?.staleReloadMode ??
        router.options.defaultStaleReloadMode) !== 'blocking'
    ) {
      inner.background.push(index)
      return finishMatchLoad(inner, index)
    }
  }

  // Must stay before the first await and keep the status === 'pending'
  // disjunct: the backgroundOnly decision in loadClientRouter relies on every
  // pending-status lane match setting requiresCommit, since pending UI can
  // only be published for a pending match.
  if (loader || match.status === 'pending' || match.invalid) {
    inner.requiresCommit = true
  }

  await (async (): Promise<void> => {
    const routeChunkPromise = loadRouteChunk(route)
    void routeChunkPromise?.catch(() => {})

    // Actually run the loader and handle the result
    try {
      // Gate on live DONOR lanes before awaiting: adoption is async, and an
      // unconditional await would break the synchronous loader-start
      // contract — both for the (overwhelmingly common) no-preload case and
      // for a preload pass seeing only its own registered lane.
      const preloadLanes = inner.router._preloadLanes
      const adopted =
        loader &&
        preloadLanes?.size &&
        !(preloadLanes.size === 1 && preloadLanes.has(inner))
          ? await adoptInFlightPreload(inner, index, passController)
          : undefined

      if (!adopted) {
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
      // A route/component chunk failure replaces the loader result, but it
      // still goes through the normal route failure lifecycle (onError,
      // redirect/notFound conversion) like beforeLoad and loader failures.
      // If loading a boundary component subsequently fails,
      // finalizeRouteFailure commits that failure directly instead of
      // recursing into another boundary chunk.
      requireCurrentMatch(inner, index, passController)
      return finalizeRouteFailure(
        inner,
        index,
        normalizeRouteFailure(inner, index, chunkError),
        passController,
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
      status: 'success',
      error: undefined,
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
      void router.navigate({
        ...(redirectError as any).options,
        replace: true,
        ignoreBlocker: true,
      })
      return
    }

    if (failure) {
      // eslint-disable-next-line prefer-const
      let [index, error] = failure
      try {
        await loadRouteChunk(
          router.routesById[matches[index]!.routeId],
          'errorComponent',
        )
        requireCurrent()
      } catch (componentError) {
        if (!isCurrentOrCancel()) {
          return
        }
        error = componentError
      }

      matches[index] = {
        ...matches[index]!,
        status: 'error',
        error,
        isFetching: false,
        updatedAt: Date.now(),
      }
      matches.length = index + 1
    } else if (notFoundError) {
      const index = getNotFoundBoundaryIndex(inner, notFoundError)
      const match = matches[index]!
      try {
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
        if (!isCurrentOrCancel()) {
          return
        }
        matches[index] = {
          ...matches[index]!,
          status: 'error',
          error: componentError,
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
    const assetsOk = isPromise(assets) ? await assets : assets

    // The background commit is atomic for data and assets: when asset
    // projection for the fresh data failed, publishing would expose new
    // loaderData under head output that still describes the previous data.
    // Keep the old lane; the fetching markers are cleared by the finalizer.
    if (assetsOk && isCurrentOrCancel()) {
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

  for (let i = 0; i < inner.matches.length && !inner.serialFailure; i++) {
    // Reads below happen synchronously at iteration start, before any await
    // could let a newer pass replace the lane entry.
    const match = inner.matches[i]!
    try {
      if (inner.preload?.includes(match.id)) {
        await (matchPromises[i] = joinPreloadedActiveMatch(inner, i))
        continue
      }

      if (match._.dehydrated) {
        // A dehydrated notFound/error is a server-committed boundary: the
        // server intentionally omitted every match below it. Replay it as
        // this pass's serial failure so the follow-up client load caps the
        // lane the same way instead of loading, committing, and projecting
        // assets for descendants the server never rendered.
        if (
          (match.status === 'notFound' && isNotFound(match.error)) ||
          match.status === 'error'
        ) {
          inner.serialFailure = [i, match.error]
          break
        }
        matchPromises[i] = loadClientRouteMatch(inner, matchPromises, i)
        continue
      }

      const beforeLoadResult = handleClientBeforeLoad(inner, i)
      inner.serialFailure = (
        isPromise(beforeLoadResult) ? await beforeLoadResult : beforeLoadResult
      ) as SerialFailure | undefined
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

  const maxIndexExclusive = inner.serialFailure
    ? serialFailurePrefixCap(inner, inner.serialFailure)
    : inner.matches.length

  for (let i = 0; i < maxIndexExclusive; i++) {
    matchPromises[i] ||= loadClientRouteMatch(inner, matchPromises, i)
  }

  if (inner.serialFailure) {
    const [index, error] = inner.serialFailure
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

  let trimIndex = inner.badIndex

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
    trimIndex = index
  }

  if (trimIndex !== undefined) {
    while (inner.matches.length > trimIndex + 1) {
      settleMatchLoad(inner.matches.pop()!)
    }
  }

  if (firstNotFound) {
    throw firstNotFound
  }

  return inner.matches
}
