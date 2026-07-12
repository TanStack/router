import { createControlledPromise, isPromise } from './utils'
import { isRedirect } from './redirect'
import {
  getLocationChangeInfo,
  locationHistoryActions,
} from './location-change'
import { settleMatchLoad } from './load-matches'
import {
  clearBackgroundFetching,
  loadClientMatches,
  startBackgroundLoad,
} from './load-matches.client'
import { projectClientRouteAssets } from './route-assets.client'
import type { AnyRouteMatch } from './Matches'
import type { AnyRouter, LoadFn } from './router'
import type { InnerLoadContext } from './load-matches'

const commitFinalMatches = (
  router: AnyRouter,
  baseMatches: Array<AnyRouteMatch>,
  nextMatches: Array<AnyRouteMatch>,
): void => {
  const { stores } = router
  router.batch(() => {
    const now = Date.now()
    const cached = stores.cachedMatches.get().slice()

    for (let i = 0; i < baseMatches.length; i++) {
      const match = baseMatches[i]!
      if (nextMatches[i]?.id !== match.id) {
        cached.push({
          ...match,
          isFetching: false,
        })
      }
    }

    let write = 0
    for (const match of cached) {
      const routeOptions = router.routesById[match.routeId]!.options
      const gcTime =
        (match.preload
          ? (routeOptions.preloadGcTime ?? router.options.defaultPreloadGcTime)
          : (routeOptions.gcTime ?? router.options.defaultGcTime)) ?? 300_000

      if (
        routeOptions.loader &&
        match.status === 'success' &&
        now - match.updatedAt < gcTime
      ) {
        cached[write++] = match
      } else {
        settleMatchLoad(match)
      }
    }

    cached.length = write
    stores.isLoading.set(false)
    stores.setMatches(nextMatches)
    if (stores.pendingIds.get().length) {
      stores.setPending([])
    }
    stores.loadedAt.set(now)
    stores.setCached(cached)
  })

  const matchCount = Math.max(baseMatches.length, nextMatches.length)
  for (let i = 0; i < matchCount; i++) {
    const current = baseMatches[i]
    const nextMatch = nextMatches[i]

    if (current && current.routeId !== nextMatch?.routeId) {
      router.routesById[current.routeId]!.options.onLeave?.(current)
    }

    if (nextMatch) {
      router.routesById[nextMatch.routeId]!.options[
        current?.routeId === nextMatch.routeId ? 'onStay' : 'onEnter'
      ]?.(nextMatch)
    }
  }
}

export const loadClientRouter = async (
  router: AnyRouter,
  opts?: Parameters<LoadFn>[0],
): Promise<void> => {
  const historyAction = opts?.action?.type
  const loadPromise = createControlledPromise<void>()
  const { stores } = router

  router.latestLoadPromise = loadPromise

  const isCurrentLoad = () => router.latestLoadPromise === loadPromise
  let startedBackgroundLoad = false

  try {
    const backgroundLoad = router._backgroundLoad
    if (backgroundLoad) {
      // A foreground navigation supersedes stale same-href background work.
      // Abort its private token and clear active fetching markers now,
      // because the background finalizer no longer owns the token.
      backgroundLoad.controller.abort()
      router._backgroundLoad = undefined
      clearBackgroundFetching(router)
    }
    router.cancelMatches()
    router.updateLatestLocation()

    const next = router.latestLocation
    const pendingMatches = router.matchRoutes(next)
    const sameHref =
      (stores.resolvedLocation.get() ?? stores.location.get()).href ===
      next.href

    router.batch(() => {
      stores.status.set('pending')
      stores.isLoading.set(true)
      stores.location.set(next)
      stores.setPending(pendingMatches)
      stores.setCached(
        stores.cachedMatches
          .get()
          .filter((match) => pendingMatches[match.index]?.id !== match.id),
      )
    })

    const baseMatches = stores.matches.get()
    if (historyAction) {
      locationHistoryActions.set(next, historyAction)
    } else {
      locationHistoryActions.delete(next)
    }

    if (router.subscribers.size) {
      const locationChangeInfo = getLocationChangeInfo(
        next,
        stores.resolvedLocation.get(),
      )

      router.emit({
        type: 'onBeforeNavigate',
        ...locationChangeInfo,
      })

      router.emit({
        type: 'onBeforeLoad',
        ...locationChangeInfo,
      })
    }

    let loadedMatches: Array<AnyRouteMatch> = pendingMatches
    const background = opts?.sync ? undefined : ([] as Array<number>)
    const commitReady = (matches: Array<AnyRouteMatch>) => {
      if (!isCurrentLoad()) {
        return
      }

      router.batch(() => {
        stores.setMatches(matches)
        if (stores.pendingIds.get().length) {
          stores.setPending([])
        }
      })
    }
    const loadContext: InnerLoadContext = {
      router,
      forceStaleReload: sameHref,
      matches: pendingMatches,
      location: next,
      background,
      onReady: commitReady,
    }
    try {
      loadedMatches = (await loadClientMatches(
        loadContext,
      )) as Array<AnyRouteMatch>
    } catch (err) {
      if (err === loadContext) {
        // This foreground lane was superseded before reaching a route outcome.
        // Let the outer load cleanup settle it as cancellation, not route error.
        throw err
      }
      if (isRedirect(err)) {
        throw err
      }
      loadContext.requiresCommit = true
    }

    const backgroundIndices = background?.filter((index) => {
      const match = loadedMatches[index]
      return match && match.status === 'success' && !match.globalNotFound
    })
    const backgroundLength = backgroundIndices?.length
    const backgroundOnly =
      sameHref &&
      backgroundLength &&
      !loadContext.requiresCommit &&
      !loadContext.pendingPublished

    if (isCurrentLoad()) {
      if (backgroundOnly) {
        router.batch(() => {
          stores.isLoading.set(false)
          if (stores.pendingIds.get().length) {
            stores.setPending([])
          }
        })
      } else {
        const assets = projectClientRouteAssets(
          router,
          loadedMatches,
          undefined,
          isCurrentLoad,
        )
        if (isPromise(assets)) {
          await assets
        }
        if (isCurrentLoad()) {
          await router.startViewTransition(async () => {
            if (isCurrentLoad()) {
              router.startTransition(() => {
                commitFinalMatches(router, baseMatches, loadedMatches)
              })
            }
          })
        }
      }
    }
    if (isCurrentLoad() && backgroundLength) {
      startedBackgroundLoad = true
      startBackgroundLoad(router, next, loadedMatches, backgroundIndices)
    }
  } catch (err) {
    if (isCurrentLoad() && isRedirect(err)) {
      stores.setPending([])
      router.navigate({
        ...err.options,
        replace: true,
        ignoreBlocker: true,
      })
    }
  }

  if (isCurrentLoad()) {
    const commitLocationPromise = router.commitLocationPromise
    router.latestLoadPromise = router.commitLocationPromise = undefined
    commitLocationPromise?.resolve()
  }

  loadPromise.resolve()
  if (startedBackgroundLoad) {
    // Background stale reloads run after the foreground lane is done. If that
    // background work is sync, its commit is queued in the next microtask; yield
    // once so the caller does not observe the temporary fetching marker.
    await Promise.resolve()
  }
}
