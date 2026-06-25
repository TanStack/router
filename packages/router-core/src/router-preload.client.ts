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

  let matches = router.matchRoutes(next, {
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

  try {
    matches = await loadClientMatches(loadContext)

    if (matches.every((match) => match.status === 'success')) {
      const assets = projectClientRouteAssets(router, matches, true)
      if (isPromise(assets)) {
        await assets
      }

      let ownedMatches: Array<AnyRouteMatch> | undefined
      for (const match of matches) {
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
