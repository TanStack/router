import { createControlledPromise, isPromise } from './utils'
import { isNotFound } from './not-found'
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

// Exiting matches are preserved in the cache both at pending publication and
// at final commit; the dedup + isFetching-reset shape must stay identical in
// both paths. Exiting match ids are unique per lane, so a linear scan over
// the (small) cache is sufficient.
const pushExitingMatch = (
  cached: Array<AnyRouteMatch>,
  match: AnyRouteMatch,
): void => {
  if (!cached.some((c) => c.id === match.id)) {
    cached.push({
      ...match,
      isFetching: false,
    })
  }
}

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
        pushExitingMatch(cached, match)
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

    // The commit already happened; lifecycle hooks are notifications. A
    // throwing hook must not skip the remaining hooks — including the same
    // index's enter/stay hook — or corrupt the framework transition state,
    // but it has to stay observable.
    if (current && current.routeId !== nextMatch?.routeId) {
      try {
        router.routesById[current.routeId]!.options.onLeave?.(current)
      } catch (err) {
        Promise.reject(err)
      }
    }

    if (nextMatch) {
      try {
        router.routesById[nextMatch.routeId]!.options[
          current?.routeId === nextMatch.routeId ? 'onStay' : 'onEnter'
        ]?.(nextMatch)
      } catch (err) {
        Promise.reject(err)
      }
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
  let loadContext: InnerLoadContext | undefined

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

    const background = opts?.sync ? undefined : ([] as Array<number>)
    const commitReady = (matches: Array<AnyRouteMatch>) => {
      if (!isCurrentLoad()) {
        return
      }

      router.batch(() => {
        // Publication replaces the active lane before final commit, so
        // exiting success matches must be preserved in the cache here: if
        // this load is superseded (e.g. back navigation) the final commit
        // that would have cached them never runs, and their fresh data
        // would otherwise be lost from every pool.
        let cached: Array<AnyRouteMatch> | undefined
        for (const match of stores.matches.get()) {
          if (
            match.status === 'success' &&
            !matches.some((m) => m.id === match.id)
          ) {
            pushExitingMatch(
              (cached ||= stores.cachedMatches.get().slice()),
              match,
            )
          }
        }
        if (cached) {
          stores.setCached(cached)
        }
        stores.setMatches(matches)
        if (stores.pendingIds.get().length) {
          stores.setPending([])
        }
      })
    }
    loadContext = {
      router,
      forceStaleReload: sameHref,
      matches: pendingMatches,
      location: next,
      background,
      onReady: commitReady,
    }
    try {
      // loadClientMatches mutates the pendingMatches lane in place; its
      // return value is that same array.
      await loadClientMatches(loadContext)
    } catch (err) {
      if (err === loadContext || isRedirect(err)) {
        // A superseded foreground lane (the loadContext sentinel) settles as
        // cancellation, not route error; redirects hand over to navigation.
        // Both are handled by the outer catch below.
        throw err
      }
      if (!isNotFound(err)) {
        // Anything else thrown here is a fatal machinery failure (e.g.
        // resolveRedirect threw); a notFound lane was already committed and
        // trimmed with settled promises. Keep the failure observable, and
        // settle the lane's load promises — the loader phase may never have
        // run for some matches (a serial redirect caps the prefix at 0), and
        // committing them unsettled would hang Suspense forever.
        Promise.reject(err)
        for (const match of pendingMatches) {
          settleMatchLoad(match)
        }
      }
      loadContext.requiresCommit = true
    }

    const backgroundIndices = background?.filter((index) => {
      const match = pendingMatches[index]
      return match && match.status === 'success' && !match.globalNotFound
    })
    const backgroundLength = backgroundIndices?.length
    // Pending-UI publication implies requiresCommit: publish() only fires for
    // a lane match still at status 'pending' (setupPendingTimeout guards in
    // load-matches.client.ts), and every pending-status match forces
    // requiresCommit before this line (loadClientRouteMatch's pre-await write,
    // finalizeRouteFailure, or the catch above) or aborts this evaluation
    // entirely.
    const backgroundOnly =
      sameHref && backgroundLength && !loadContext.requiresCommit

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
          pendingMatches,
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
                commitFinalMatches(router, baseMatches, pendingMatches)
              })
            }
          })
        }
      }
    }
    if (isCurrentLoad() && backgroundLength) {
      startedBackgroundLoad = true
      startBackgroundLoad(router, next, pendingMatches, backgroundIndices)
    }
  } catch (err) {
    if (isCurrentLoad() && isRedirect(err)) {
      stores.setPending([])
      router.navigate({
        ...err.options,
        replace: true,
        ignoreBlocker: true,
      })
    } else if (err !== loadContext && !isRedirect(err)) {
      // Anything else is a genuine failure (asset projection, view
      // transition, user onLeave/onStay/onEnter hooks). The public load
      // promise still resolves — navigation state was already committed or
      // superseded — but the error must stay observable to the app's
      // unhandled-rejection reporting instead of vanishing.
      Promise.reject(err)
    }
  }

  if (isCurrentLoad()) {
    const commitLocationPromise = router.commitLocationPromise
    router.latestLoadPromise = router.commitLocationPromise = undefined
    commitLocationPromise?.resolve()
  }

  // Ordering invariant: the success lane must already be published
  // (setMatches in commitFinalMatches above) before this resolve. Framework
  // Match components throw router.latestLoadPromise for stale pending
  // snapshots and rely on that ordering to avoid a suspense busy-loop on an
  // already-resolved load.
  loadPromise.resolve()

  // A superseded or redirected load must not settle its public await before
  // the navigation chain does: callers of router.load()/invalidate() rely on
  // observing post-settlement state, and the preload borrow protocol uses the
  // foreground load promise as its "committed or gone" signal.
  //
  // Termination invariant: latestLoadPromise is only ever installed as a fresh
  // promise by a newer pass (top of this function) or cleared to undefined by
  // the owning pass in the same sync block that resolves it (above). So after
  // `await latest`, latestLoadPromise is either undefined or a strictly newer
  // pass's promise — never `latest` (or this pass's loadPromise) again. Any
  // future writer that resolves latestLoadPromise without replacing/clearing
  // it would turn this loop into an infinite microtask spin.
  let latest = router.latestLoadPromise
  while (latest) {
    await latest
    latest = router.latestLoadPromise
  }

  if (startedBackgroundLoad) {
    // Background stale reloads run after the foreground lane is done. If that
    // background work is sync, its commit is queued in the next microtask; yield
    // once so the caller does not observe the temporary fetching marker.
    await Promise.resolve()
  }
}
