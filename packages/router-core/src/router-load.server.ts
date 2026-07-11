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
  let caughtServerError = false
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
    let caughtError = err
    let resolvedRedirect: ReturnType<AnyRouter['resolveRedirect']> | undefined
    try {
      resolvedRedirect = isRedirect(err)
        ? router.resolveRedirect(err)
        : undefined
    } catch (resolutionError) {
      // Matching can throw an unresolved redirect before loadServerMatches
      // owns a lane. Normalize a resolver failure through the fatal 500 path
      // instead of escaping this catch with stale response status.
      caughtError = resolutionError
      resolvedRedirect = undefined
    }
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

    // Redirect/notFound metadata may not have a committed boundary match.
    // Any other escaped failure establishes a 500 fallback even when match
    // loading failed before it could commit a renderable error outcome.
    if (resolvedRedirect) {
      router.statusCode = (resolvedRedirect.options as any).statusCode
    } else if (isNotFound(caughtError)) {
      router.statusCode = 404
    } else {
      // Server load machinery can fail before a renderable error match exists
      // (for example while resolving a redirect target). Never report that
      // failure as a successful response.
      router.statusCode = 500
      caughtServerError = true
    }
    router.redirect = resolvedRedirect
  } finally {
    const commitLocationPromise = router.commitLocationPromise
    router.commitLocationPromise = undefined
    commitLocationPromise?.resolve()
  }

  const finalMatches = router.stores.matches.get()
  const newStatusCode = finalMatches.some(
    (d) => d.status === 'notFound' || d.globalNotFound,
  )
    ? 404
    : finalMatches.some((d) => d.status === 'error')
      ? 500
      : undefined
  if (newStatusCode && !caughtServerError) {
    router.statusCode = newStatusCode
  }
}
