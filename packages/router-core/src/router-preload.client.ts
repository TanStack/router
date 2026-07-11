import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import {
  abortDiscardedMatchControllers,
  loadClientMatches,
} from './load-matches.client'
import { projectClientRouteAssets } from './route-assets.client'
import { settleMatchLoad } from './load-matches'
import { deepEqual, isPromise } from './utils'
import type { AnyRouteMatch } from './Matches'
import type { AnyRouter } from './router'
import type { InnerLoadContext } from './load-matches'

export const preloadClientRoute = async (
  router: AnyRouter,
  opts: any,
): Promise<Array<AnyRouteMatch> | undefined> => {
  const previousLatestLoadPromise = router.latestLoadPromise
  const next = opts._builtLocation ?? router.buildLocation(opts)

  const matches = router.matchRoutes(next, {
    throwOnError: true,
    preload: true,
    _isCurrent: () =>
      router.latestLoadPromise === previousLatestLoadPromise,
  })

  // Route matching can execute user context code. If it synchronously starts
  // a navigation, this speculative pass no longer owns the remaining match
  // callbacks or any work derived from its partial lane.
  if (router.latestLoadPromise !== previousLatestLoadPromise) {
    abortDiscardedMatchControllers(router, matches)
    return
  }

  const loadContext: InnerLoadContext = {
    router,
    matches,
    location: next,
    preload: router.stores.matchesId
      .get()
      .concat(router.stores.pendingIds.get()),
  }

  // A failed descendant must not discard the work of its successful
  // ancestors: the leading run of success matches is projected and cached so
  // repeated hovers (and the eventual navigation) can reuse those loads. The
  // cache invariant still holds — only owned success snapshots enter the
  // cache; the failed/pending tail never does.
  const preloadBorrowsAreCurrent = (): boolean => {
    for (const borrowed of matches) {
      if (borrowed.preload) {
        continue
      }
      const match = router.getMatch(borrowed.id, false)
      if (!match) {
        return false
      }
      if (
        match.abortController !== borrowed.abortController ||
        borrowed.abortController.signal.aborted
      ) {
        const routeOptions = router.routesById[borrowed.routeId]!.options
        if (
          routeOptions.loader ||
          routeOptions.beforeLoad ||
          routeOptions.context ||
          !deepEqual(match.params, borrowed.params) ||
          !deepEqual(match.search, borrowed.search) ||
          !deepEqual(match.context, borrowed.context)
        ) {
          return false
        }
      }
      if (
        match.status !== 'success' ||
        match.isFetching !== false ||
        match._.error
      ) {
        return false
      }
    }
    return true
  }

  const cacheSuccessfulPrefix = async (): Promise<false | void> => {
    let prefixEnd = 0
    while (matches[prefixEnd]?.status === 'success') {
      prefixEnd++
    }
    if (!prefixEnd) {
      return
    }

    const prefix =
      prefixEnd === matches.length ? matches : matches.slice(0, prefixEnd)
    const assets = projectClientRouteAssets(
      router,
      prefix,
      true,
      preloadBorrowsAreCurrent,
    )
    if (isPromise(assets)) {
      await assets
    }
    if (!preloadBorrowsAreCurrent()) {
      return false
    }

    const previousCachedMatches = router.stores.cachedMatches.get()
    let ownedMatches: Array<AnyRouteMatch> | undefined
    for (const match of prefix) {
      // A cached snapshot this pass reused without a successful loader
      // generation is not owned work: re-caching it would
      // restamp `preload: true` — silently demoting a navigation entry from
      // gcTime to preloadGcTime. Only explicit successful loader generations
      // are reusable cache data; loaderless speculative matches stay private.
      // Asset projection can finish out of order across concurrent preloads,
      // so an older loader generation must not overwrite a newer cached one.
      if (
        !router.getMatch(match.id, false) &&
        match._.preloadLoaderSuccess
      ) {
        const cachedMatch = previousCachedMatches.find(
          (candidate) => candidate.id === match.id,
        )
        if (
          !cachedMatch ||
          (cachedMatch._.loaderGeneration ?? 0) <=
            match._.loaderGeneration!
        ) {
          ;(ownedMatches ||= []).push(match)
        }
      }
    }
    if (ownedMatches) {
      router.stores.setCached([
        ...previousCachedMatches.filter(
          (cachedMatch) =>
            !ownedMatches.some((match) => match.id === cachedMatch.id),
        ),
        ...ownedMatches,
      ])
      abortDiscardedMatchControllers(router, previousCachedMatches)
    }
  }

  // Register the lane so concurrent navigations (and sibling preloads) can
  // adopt this pass's in-flight loader results instead of re-running them.
  const preloadLanes = (router._preloadLanes ??= new Set())
  preloadLanes.add(loadContext)

  try {
    // loadClientMatches mutates the lane in place and returns it.
    await loadClientMatches(loadContext)

    if ((await cacheSuccessfulPrefix()) === false) {
      return
    }

    return matches
  } catch (err) {
    if (err === loadContext) {
      // The preload lane lost ownership while borrowing active/pending matches.
      // Do not project assets or cache speculative descendants for this pass.
      return
    }
    if (isRedirect(err)) {
      if (err.options.reloadDocument) {
        return
      }

      return preloadClientRoute(router, {
        ...err.options,
        _fromLocation: next,
      })
    }

    // notFound/error outcomes are not fatal to the app, and the successful
    // ancestor prefix is still valid cacheable work.
    await cacheSuccessfulPrefix()

    if (process.env.NODE_ENV !== 'production' && !isNotFound(err)) {
      // Preload errors are not fatal, but we should still log them
      console.error(err)
    }
    return
  } finally {
    preloadLanes.delete(loadContext)
    for (const match of matches) {
      if (match.preload) {
        settleMatchLoad(match)
      }
    }
    abortDiscardedMatchControllers(
      router,
      matches.concat(loadContext.discardedMatches ?? []),
    )
  }
}
