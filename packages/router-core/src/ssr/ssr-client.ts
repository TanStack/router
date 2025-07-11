import invariant from 'tiny-invariant'
import type { MakeRouteMatch } from '../Matches'
import type { AnyRouter } from '../router'
import type { Manifest } from '../manifest'
import type { RouteContextOptions } from '../route'
import type { GLOBAL_TSR } from './ssr-server'

declare global {
  interface Window {
    [GLOBAL_TSR]?: TsrSsrGlobal
  }
}

export interface TsrSsrGlobal {
  router?: DehydratedRouter
  // clean scripts, shortened since this is sent for each streamed script
  c: () => void
}

function hydrateMatch(
  deyhydratedMatch: DehydratedMatch,
): Partial<MakeRouteMatch> {
  return {
    id: deyhydratedMatch.i,
    __beforeLoadContext: deyhydratedMatch.b,
    loaderData: deyhydratedMatch.l,
    status: deyhydratedMatch.s,
    ssr: deyhydratedMatch.ssr,
    updatedAt: deyhydratedMatch.u,
    error: deyhydratedMatch.e,
  }
}
export interface DehydratedMatch {
  i: MakeRouteMatch['id']
  b?: MakeRouteMatch['__beforeLoadContext']
  l?: MakeRouteMatch['loaderData']
  e?: MakeRouteMatch['error']
  u: MakeRouteMatch['updatedAt']
  s: MakeRouteMatch['status']
  ssr?: MakeRouteMatch['ssr']
}

export interface DehydratedRouter {
  manifest: Manifest | undefined
  dehydratedData?: any
  lastMatchId?: string
  matches: Array<DehydratedMatch>
}

export async function hydrate(router: AnyRouter): Promise<any> {
  invariant(
    window.$_TSR?.router,
    'Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
  )

  const { manifest, dehydratedData, lastMatchId } = window.$_TSR.router

  router.ssr = {
    manifest,
  }

  // Hydrate the router state
  const matches = router.matchRoutes(router.state.location)

  // kick off loading the route chunks
  const routeChunkPromise = Promise.all(
    matches.map((match) => {
      const route = router.looseRoutesById[match.routeId]!
      return router.loadRouteChunk(route)
    }),
  )

  // Right after hydration and before the first render, we need to rehydrate each match
  // First step is to reyhdrate loaderData and __beforeLoadContext
  let firstNonSsrMatchIndex: number | undefined = undefined
  matches.forEach((match) => {
    const dehydratedMatch = window.$_TSR!.router!.matches.find(
      (d) => d.i === match.id,
    )
    if (!dehydratedMatch) {
      Object.assign(match, { dehydrated: false, ssr: false })
      return
    }

    Object.assign(match, hydrateMatch(dehydratedMatch))

    if (match.ssr === false) {
      match._dehydrated = false
    } else {
      match._dehydrated = true
    }

    if (match.ssr === 'data-only' || match.ssr === false) {
      if (firstNonSsrMatchIndex === undefined) {
        firstNonSsrMatchIndex = match.index
        match._forcePending = true
      }
    }

    if (match.ssr === false) {
      return
    }
  })

  router.__store.setState((s) => {
    return {
      ...s,
      matches,
    }
  })

  // Allow the user to handle custom hydration data
  await router.options.hydrate?.(dehydratedData)

  // now that all necessary data is hydrated:
  // 1) fully reconstruct the route context
  // 2) execute `head()` and `scripts()` for each match
  await Promise.all(
    router.state.matches.map(async (match) => {
      const route = router.looseRoutesById[match.routeId]!

      const parentMatch = router.state.matches[match.index - 1]
      const parentContext = parentMatch?.context ?? router.options.context ?? {}

      // `context()` was already executed by `matchRoutes`, however route context was not yet fully reconstructed
      // so run it again and merge route context
      const contextFnContext: RouteContextOptions<any, any, any, any> = {
        deps: match.loaderDeps,
        params: match.params,
        context: parentContext,
        location: router.state.location,
        navigate: (opts: any) =>
          router.navigate({ ...opts, _fromLocation: router.state.location }),
        buildLocation: router.buildLocation,
        cause: match.cause,
        abortController: match.abortController,
        preload: false,
        matches,
      }
      match.__routeContext = route.options.context?.(contextFnContext) ?? {}

      match.context = {
        ...parentContext,
        ...match.__routeContext,
        ...match.__beforeLoadContext,
      }

      const assetContext = {
        matches: router.state.matches,
        match,
        params: match.params,
        loaderData: match.loaderData,
      }
      const headFnContent = await route.options.head?.(assetContext)

      const scripts = await route.options.scripts?.(assetContext)

      match.meta = headFnContent?.meta
      match.links = headFnContent?.links
      match.headScripts = headFnContent?.scripts
      match.styles = headFnContent?.styles
      match.scripts = scripts
    }),
  )

  // schedule router.load() to run after the next tick so we can store the promise in the match before loading starts
  const loadPromise = Promise.resolve()
    .then(() => router.load())
    .catch((err) => {
      console.error('Error during router hydration:', err)
    })

  // in SPA mode we need to keep the outermost match  pending until router.load() is finished
  // this will prevent that other pending components are rendered but hydration is not blocked
  if (matches[matches.length - 1]!.id !== lastMatchId) {
    const matchId = matches[0]!.id
    router.updateMatch(matchId, (prev) => {
      return {
        ...prev,
        _displayPending: true,
        displayPendingPromise: loadPromise,
        // make sure that the pending component is displayed for at least pendingMinMs
        _forcePending: true,
      }
    })
    // hide the pending component once the load is finished
    loadPromise.then(() => {
      router.updateMatch(matchId, (prev) => {
        return {
          ...prev,
          _displayPending: undefined,
          displayPendingPromise: undefined,
        }
      })
    })
  }
  return routeChunkPromise
}
