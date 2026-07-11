import { invariant } from '../invariant'
import { getMatchContext, settleMatchLoad } from '../load-matches'
import { isNotFound } from '../not-found'
import { hydrateSsrMatchId } from './ssr-match-id'
import type { GLOBAL_SEROVAL, GLOBAL_TSR } from './constants'
import type { TsrSsrGlobal } from './types'
import type { AnyRouteMatch } from '../Matches'
import type { AnyRouter } from '../router'
import type { RouteContextOptions } from '../route'
import type { AnySerializationAdapter } from './serializer/transformer'

declare global {
  interface Window {
    [GLOBAL_TSR]?: TsrSsrGlobal
    [GLOBAL_SEROVAL]?: any
  }
}

export async function hydrate(router: AnyRouter): Promise<any> {
  const tsr = window.$_TSR
  if (!tsr) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'Invariant failed: Expected to find bootstrap data on window.$_TSR, but we did not. Please file an issue!',
      )
    }

    invariant()
  }

  const serializationAdapters = router.options.serializationAdapters as
    | Array<AnySerializationAdapter>
    | undefined

  if (serializationAdapters?.length) {
    const fromSerializableMap = new Map()
    for (const adapter of serializationAdapters) {
      fromSerializableMap.set(adapter.key, adapter.fromSerializable)
    }
    tsr.t = fromSerializableMap
    for (const script of tsr.buffer) {
      script()
    }
  }
  tsr.initialized = true

  const dehydratedRouter = tsr.router
  if (!dehydratedRouter) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'Invariant failed: Expected to find a dehydrated data on window.$_TSR.router, but we did not. Please file an issue!',
      )
    }

    invariant()
  }

  const lastMatchId = dehydratedRouter.lastMatchId
    ? hydrateSsrMatchId(dehydratedRouter.lastMatchId)
    : undefined
  const { manifest, dehydratedData } = dehydratedRouter
  router.ssr = {
    manifest,
  }
  const meta = document.querySelector('meta[property="csp-nonce"]') as
    | HTMLMetaElement
    | undefined
  const nonce = meta?.content
  router.options.ssr = {
    nonce,
  }

  // Allow the user to handle custom hydration data before matching routes.
  // This lets hydration install router config that affects matching, e.g. rewrites.
  // Do not alias `router.options` across this hook: it may call `router.update`,
  // and the rest of hydration must observe the updated options.
  await router.options.hydrate?.(dehydratedData)

  // Hydrate the router state
  const location = router.stores.location.get()
  const matches = router.matchRoutes(location)
  const routesById = router.routesById

  // Right after hydration and before the first render, we need to rehydrate each match
  // First step is to rehydrate loaderData and beforeLoad context.
  let firstNonSsrMatch: AnyRouteMatch | undefined = undefined
  let hasSsrFalseMatches = false
  const dehydratedMatchesById = new Map(
    dehydratedRouter.matches.map(
      (dehydrated) => [hydrateSsrMatchId(dehydrated.i), dehydrated] as const,
    ),
  )
  const routeChunkPromise = Promise.all(
    matches.map((match) => {
      const route = routesById[match.routeId]!

      const dehydratedMatch = dehydratedMatchesById.get(match.id)
      if (!dehydratedMatch) {
        match.ssr = false
      } else {
        match.__beforeLoadContext = dehydratedMatch.b
        match.loaderData = dehydratedMatch.l
        match.status = dehydratedMatch.s
        match.ssr = dehydratedMatch.ssr
        match.updatedAt = dehydratedMatch.u
        match.error = dehydratedMatch.e

        // Only hydrate global-not-found when a defined value is present in the
        // dehydrated payload. If omitted, preserve the value computed from the
        // current client location.
        if (dehydratedMatch.g !== undefined) {
          match.globalNotFound = dehydratedMatch.g
        }
      }

      match._.dehydrated = match.ssr !== false

      if (match.ssr === false) {
        match.status = 'pending'
        match.error = undefined
        hasSsrFalseMatches = true
        if (!firstNonSsrMatch) {
          firstNonSsrMatch = match
        }
      } else if (!firstNonSsrMatch && match.ssr === 'data-only') {
        firstNonSsrMatch = match
      }

      if (!dehydratedMatch) {
        // The server trimmed this descendant below an error/notFound boundary.
        // Its follow-up client load is capped by the dehydrated boundary, so
        // loading its normal chunk now would be both unnecessary and unsafe.
        return
      }
      if (match.status === 'error') {
        return router.loadRouteChunk(route, 'errorComponent')
      }
      if (match.status === 'notFound' || match.globalNotFound) {
        return router.loadRouteChunk(route, 'notFoundComponent')
      }
      return router.loadRouteChunk(route)
    }),
  )
  const loadContext = { router, matches }

  const lastDehydratedMatch =
    dehydratedRouter.matches[dehydratedRouter.matches.length - 1]
  // A terminal boundary can intentionally cap the server lane above client
  // matches that still exist for the URL. That is not SPA shell mode: the
  // server already rendered the boundary, so hydration must keep it visible
  // instead of replacing it with the shell pending fallback.
  const isSpaMode =
    matches[matches.length - 1]!.id !== lastMatchId &&
    lastDehydratedMatch?.s !== 'error' &&
    lastDehydratedMatch?.s !== 'notFound' &&
    !lastDehydratedMatch?.g

  let displayMatch = isSpaMode ? matches[1] : firstNonSsrMatch
  let displayUntil = 0

  if (isSpaMode && !displayMatch) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(
        'Invariant failed: Expected to find a match below the root match in SPA mode.',
      )
    }

    invariant()
  }

  if (displayMatch) {
    const route = routesById[displayMatch.routeId]!
    const pendingComponent =
      route.options.pendingComponent ??
      (router.options as any).defaultPendingComponent

    const displayMinMs = pendingComponent
      ? (route.options.pendingMinMs ?? router.options.defaultPendingMinMs)
      : undefined

    if (isSpaMode || hasSsrFalseMatches || displayMinMs) {
      displayMatch._displayPending = true
      settleMatchLoad(displayMatch)

      if (displayMinMs) {
        displayUntil = Date.now() + displayMinMs
      }
    } else {
      displayMatch = undefined
    }
  }

  router.stores.setMatches(matches)

  // Hydration owns the exact match generations it published above. Href alone
  // is insufficient: a same-href navigation can replace the lane and later
  // clear latestLoadPromise before an old hydration hook resumes (ABA). Every
  // lane contains root and every rematch gives it a fresh controller, so root
  // is the constant-time generation token for the whole lane.
  const hydrationMatch = matches[0]!
  const isHydrationCurrent = () =>
    router.stores.location.get() === location &&
    router.getMatch(hydrationMatch.id, false)?.abortController ===
      hydrationMatch.abortController

  const clearDisplayPending = () => {
    let isStillLoadingDisplayMatch = false
    if (displayMatch) {
      router.updateMatch(displayMatch.id, (match) => {
        if (
          !match._displayPending ||
          (match.status === 'pending' && router.stores.isLoading.get())
        ) {
          // A SPA/ssr:false hydration pass can start a follow-up client load
          // for this match. Keep the server-visible fallback until that load
          // leaves the match's pending state.
          isStillLoadingDisplayMatch = !!match._displayPending
          return match
        }

        settleMatchLoad(match)
        return {
          ...match,
          _displayPending: undefined,
        }
      })
    }
    return isStillLoadingDisplayMatch
  }

  const finishDisplayPending = (): void | Promise<void> => {
    const remaining = displayUntil - Date.now()
    if (remaining > 0) {
      return new Promise<void>((resolve) =>
        setTimeout(resolve, remaining),
      ).then(finishDisplayPending)
    }

    if (clearDisplayPending()) {
      return router.latestLoadPromise?.then(finishDisplayPending)
    }
    return undefined
  }

  const abandonHydration = (): void => {
    matches.forEach(settleMatchLoad)
    if (displayMatch) {
      displayMatch._displayPending = undefined
    }
  }

  const handleHydrationError = (match: AnyRouteMatch, err: unknown): void => {
    if (!isHydrationCurrent()) {
      return
    }
    if (isNotFound(err)) {
      match.error = { isNotFound: true }
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          `NotFound error during hydration for routeId: ${match.routeId}`,
          err,
        )
      }
    } else {
      match.error = err
      if (process.env.NODE_ENV !== 'production') {
        console.error(`Error during hydration for route ${match.routeId}:`, err)
      }
      throw err
    }
  }

  try {
    // Lazy route chunks can install context/head/scripts options. Display
    // pending is already published above, so wait here before reconstructing
    // hydration state from those route options.
    await routeChunkPromise
    if (!isHydrationCurrent()) {
      return abandonHydration()
    }

    // Reconstruct every match context before any asset hook runs. An ancestor
    // head({ matches }) may inspect a descendant's hydrated beforeLoad context,
    // just as it can during server and normal client asset projection.
    const hydratedContexts = matches.map((match) => {
      try {
        if (!isHydrationCurrent()) {
          return false
        }
        const route = routesById[match.routeId]!
        route.options.ssr = match.ssr

        // `context()` was already executed by `matchRoutes`, however route context was not yet fully reconstructed
        // so run it again and merge route context
        if (route.options.context) {
          match.__routeContext = route.options.context({
            deps: match.loaderDeps,
            params: match.params,
            context:
              matches[match.index - 1]?.context ?? router.options.context ?? {},
            location,
            navigate: (opts: any) =>
              router.navigate({
                ...opts,
                _fromLocation: location,
              }),
            buildLocation: router.buildLocation,
            cause: match.cause,
            abortController: match.abortController,
            preload: false,
            matches,
            routeId: route.id,
          } as RouteContextOptions<any, any, any, any, any>)
        }

        if (!isHydrationCurrent()) {
          return false
        }

        match.context = getMatchContext(
          loadContext,
          match.index,
          match.__beforeLoadContext,
        )
        return true
      } catch (err) {
        handleHydrationError(match, err)
        return false
      }
    })

    await Promise.all(
      matches.map(async (match, index) => {
        if (!hydratedContexts[index] || !isHydrationCurrent()) {
          return
        }
        const route = routesById[match.routeId]!

        // The server rendered no assets for ssr:false matches — including
        // matches it intentionally omitted at an error/notFound boundary,
        // which the dehydrated payload also marks ssr:false. Their
        // head()/scripts() could only run with missing or stale loader
        // data here; the follow-up client load projects assets for the
        // lane it actually commits.
        if (match.ssr === false) {
          return
        }

        try {
          const assetContext = {
            ssr: router.options.ssr,
            matches,
            match,
            params: match.params,
            loaderData: match.loaderData,
          }
          const headFnContent = await route.options.head?.(assetContext)

          if (!isHydrationCurrent()) {
            return
          }

          const scripts = await route.options.scripts?.(assetContext)

          if (!isHydrationCurrent()) {
            return
          }

          match.meta = headFnContent?.meta
          match.links = headFnContent?.links
          match.headScripts = headFnContent?.scripts
          match.styles = headFnContent?.styles
          match.scripts = scripts
        } catch (err) {
          handleHydrationError(match, err)
        }
      }),
    )
  } catch (err) {
    if (!isHydrationCurrent()) {
      return abandonHydration()
    }
    matches.forEach(settleMatchLoad)
    clearDisplayPending()
    throw err
  }

  if (!isHydrationCurrent()) {
    return abandonHydration()
  }

  // all matches have data from the server and we are not in SPA mode so we don't need to kick of router.load()
  if (!hasSsrFalseMatches && !isSpaMode) {
    matches.forEach((match) => {
      // remove the dehydrated flag since we won't run router.load() which would remove it
      match._.dehydrated = undefined
    })
    // Mark the current location as resolved so that later load cycles
    // (e.g. preloads, invalidations) don't mistakenly detect a href change
    // (resolvedLocation defaults to undefined and router.load() is skipped
    // in the normal SSR hydration path).
    router.stores.resolvedLocation.set(location)

    matches.forEach(settleMatchLoad)

    void finishDisplayPending()
    return
  }

  void router
    .load()
    .catch((err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Error during router hydration:', err)
      }
    })
    .then(() => {
      router.batch(() => {
        // ensure router is not in status 'pending' anymore
        // this usually happens in Transitioner but if loading synchronously resolves,
        // Transitioner won't be rendered while loading so it cannot track the change from loading:true to loading:false
        if (router.stores.status.get() === 'pending') {
          router.stores.status.set('idle')
          router.stores.resolvedLocation.set(router.stores.location.get())
        }
      })

      return finishDisplayPending()
    })
}
