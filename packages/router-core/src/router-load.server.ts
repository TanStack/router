import { isNotFound } from './not-found'
import { isRedirect, redirect } from './redirect'
import { loadServerMatches } from './load-matches.server'
import type { AnyRouteMatch } from './Matches'
import type { AnyRouter, LoadFn } from './router'

export const loadServerRouter = async (
  router: AnyRouter,
  opts?: Parameters<LoadFn>[0],
): Promise<void> => {
  let matchedMatches: Array<AnyRouteMatch> | undefined
  try {
    const next = router.pendingBuiltLocation ?? router.latestLocation
    router.latestLocation = next

    const nextLocation = router.buildLocation({
      to: next.pathname,
      search: true,
      params: true,
      hash: true,
      state: true,
      _includeValidateSearch: true,
    })

    if (next.publicHref !== nextLocation.publicHref) {
      const href = nextLocation.publicHref || '/'
      throw nextLocation.external
        ? redirect({ href })
        : redirect({ href, _builtLocation: nextLocation })
    }

    matchedMatches = router.matchRoutes(next)

    router.statusCode = 200
    router.stores.location.set(next)

    const loadedMatches = (await loadServerMatches({
      router,
      matches: matchedMatches,
      location: next,
    })) as Array<AnyRouteMatch>

    router.stores.loadedAt.set(Date.now())
    router.stores.setMatches(loadedMatches)
  } catch (err) {
    let resolvedRedirect = isRedirect(err)
      ? router.resolveRedirect(err)
      : undefined
    if (resolvedRedirect) {
      const options = resolvedRedirect.options as any
      const statusCode =
        options.statusCode ??
        options.code ??
        (resolvedRedirect.status === 200 ? 307 : resolvedRedirect.status)
      options.statusCode = statusCode

      if (resolvedRedirect.status !== statusCode) {
        const redirectResponse = new Response(null, {
          status: statusCode,
          headers: resolvedRedirect.headers,
        }) as typeof resolvedRedirect
        redirectResponse.options = resolvedRedirect.options
        redirectResponse.redirectHandled = resolvedRedirect.redirectHandled
        resolvedRedirect = redirectResponse
      }
    } else if (matchedMatches?.length) {
      router.stores.loadedAt.set(Date.now())
      router.stores.setMatches(matchedMatches)
    }

    router.statusCode = resolvedRedirect
      ? (resolvedRedirect.options as any).statusCode
      : isNotFound(err)
        ? 404
        : router.stores.matches.get().some((d) => d.status === 'error')
          ? 500
          : 200
    router.redirect = resolvedRedirect
  } finally {
    const commitLocationPromise = router.commitLocationPromise
    router.latestLoadPromise = undefined
    router.commitLocationPromise = undefined
    commitLocationPromise?.resolve()
  }

  const newStatusCode = router.stores.matches
    .get()
    .some((d) => d.status === 'notFound' || d.globalNotFound)
    ? 404
    : router.stores.matches.get().some((d) => d.status === 'error')
      ? 500
      : undefined
  if (newStatusCode) {
    router.statusCode = newStatusCode
  }
}
