import { isNotFound } from './not-found'
import { isRedirect } from './redirect'
import { loadClientMatches } from './load-matches.client'
import { projectClientRouteAssets } from './route-assets.client'
import { settleMatchLoad } from './load-matches'
import { isPromise } from './utils'
import type { AnyRouteMatch } from './Matches'
import type { AnyRouter } from './router'
import type { InnerLoadContext } from './load-matches'

export const preloadClientRoute = async (
  router: AnyRouter,
  opts: any,
): Promise<Array<AnyRouteMatch> | undefined> => {
  const next = opts._builtLocation ?? router.buildLocation(opts)

  const matches = router.matchRoutes(next, {
    throwOnError: true,
    preload: true,
  })

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
  const cacheSuccessfulPrefix = async (): Promise<void> => {
    let prefixEnd = 0
    while (
      prefixEnd < matches.length &&
      matches[prefixEnd]!.status === 'success'
    ) {
      prefixEnd++
    }
    if (!prefixEnd) {
      return
    }

    const prefix =
      prefixEnd === matches.length ? matches : matches.slice(0, prefixEnd)
    const assets = projectClientRouteAssets(router, prefix, true)
    if (isPromise(assets)) {
      await assets
    }

    let ownedMatches: Array<AnyRouteMatch> | undefined
    for (const match of prefix) {
      if (match.preload && !router.getMatch(match.id, false)) {
        ;(ownedMatches ||= []).push(match)
      }
    }
    if (ownedMatches) {
      router.stores.setCached([
        ...router.stores.cachedMatches
          .get()
          .filter(
            (cachedMatch) =>
              !ownedMatches.some((match) => match.id === cachedMatch.id),
          ),
        ...ownedMatches,
      ])
    }
  }

  try {
    // loadClientMatches mutates the lane in place and returns it.
    await loadClientMatches(loadContext)

    await cacheSuccessfulPrefix()

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
    for (const match of matches) {
      if (match.preload) {
        settleMatchLoad(match)
      }
    }
  }
}
