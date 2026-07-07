import * as Vue from 'vue'
import {
  getLocationChangeInfo,
  invariant,
  isNotFound,
  rootRouteId,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useStore } from '@tanstack/vue-store'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { ClientOnly } from './ClientOnly'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { matchContext, routeIdContext } from './matchContext'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import type { VNode } from 'vue'
import type {
  AnyRoute,
  ParsedLocation,
  RootRouteOptions,
} from '@tanstack/router-core'

export const Match = Vue.defineComponent({
  name: 'Match',
  props: {
    matchId: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()

    // Derive routeId from initial props.matchId — stable for this component's
    // lifetime. The routeId never changes for a given route position in the
    // tree, even when matchId changes (loaderDepsHash, etc).
    const routeId = router.stores.matchStores.get(props.matchId)?.routeId

    if (!routeId) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invariant failed: Could not find routeId for matchId "${props.matchId}". Please file an issue!`,
        )
      }

      invariant()
    }

    // Static route-tree check: is this route a direct child of the root?
    // parentRoute is set at build time, so no reactive tracking needed.
    const isChildOfRoot =
      (router.routesById[routeId] as AnyRoute)?.parentRoute?.id === rootRouteId

    // Single stable store subscription — getRouteMatchStore returns a
    // cached computed store that resolves routeId → current match state
    // through the signal graph. No bridge needed.
    const activeMatch = useStore(
      router.stores.getRouteMatchStore(routeId),
      (value) => value,
    )
    const loadedAt = useStore(router.stores.loadedAt, (value) => value)

    const matchData = Vue.computed(() => {
      const match = activeMatch.value
      if (!match) {
        return null
      }

      return {
        matchId: match.id,
        routeId,
        loadedAt: loadedAt.value,
        ssr: match.ssr,
        _displayPending: match._displayPending,
      }
    })

    const route = Vue.computed(() =>
      matchData.value ? router.routesById[matchData.value.routeId] : null,
    )

    const PendingComponent = Vue.computed(
      () =>
        route.value?.options?.pendingComponent ??
        router?.options?.defaultPendingComponent,
    )

    const pendingElement = () =>
      PendingComponent.value ? Vue.h(PendingComponent.value) : undefined

    const routeErrorComponent = Vue.computed(
      () =>
        route.value?.options?.errorComponent ??
        router?.options?.defaultErrorComponent,
    )

    const routeOnCatch = Vue.computed(
      () => route.value?.options?.onCatch ?? router?.options?.defaultOnCatch,
    )

    const routeNotFoundComponent = Vue.computed(() =>
      route.value?.isRoot
        ? // If it's the root route, use the globalNotFound option, with fallback to the notFoundRoute's component
          (route.value?.options?.notFoundComponent ??
          router?.options?.notFoundRoute?.options?.component)
        : route.value?.options?.notFoundComponent,
    )

    const hasShellComponent = Vue.computed(() => {
      if (!route.value?.isRoot) return false
      return !!(route.value.options as RootRouteOptions).shellComponent
    })

    const ShellComponent = Vue.computed(() =>
      hasShellComponent.value
        ? ((route.value!.options as RootRouteOptions).shellComponent as any)
        : null,
    )

    // Provide routeId context (stable string) for children.
    // MatchInner, Outlet, and useMatch all consume this.
    Vue.provide(routeIdContext, routeId)

    // Provide reactive nearest-match context for hooks that slice the active
    // matches array relative to the current match.
    const matchIdRef = Vue.computed(
      () => activeMatch.value?.id ?? props.matchId,
    )
    Vue.provide(matchContext, matchIdRef)

    return (): VNode => {
      const actualMatchId = matchData.value?.matchId ?? props.matchId

      const resolvedNoSsr =
        matchData.value?.ssr === false || matchData.value?.ssr === 'data-only'
      const shouldClientOnly =
        resolvedNoSsr || !!matchData.value?._displayPending

      const renderMatchContent = (): VNode => {
        const matchInner = () => Vue.h(MatchInner, { matchId: actualMatchId })

        let content: VNode = shouldClientOnly
          ? Vue.h(
              ClientOnly,
              {
                fallback: pendingElement(),
              },
              {
                default: matchInner,
              },
            )
          : matchInner()

        // Wrap in NotFound boundary if needed
        if (routeNotFoundComponent.value) {
          content = Vue.h(CatchNotFound, {
            fallback: (error: any) => {
              error.routeId ??= matchData.value?.routeId

              // If the current not found handler doesn't exist or it has a
              // route ID which doesn't match the current route, rethrow the error
              if (
                !routeNotFoundComponent.value ||
                (error.routeId && error.routeId !== matchData.value?.routeId) ||
                (!error.routeId && route.value && !route.value.isRoot)
              )
                throw error

              return Vue.h(routeNotFoundComponent.value, error)
            },
            children: content,
          })
        }

        // Wrap in error boundary if needed
        if (routeErrorComponent.value) {
          content = CatchBoundary({
            getResetKey: () => matchData.value?.loadedAt ?? 0,
            errorComponent: routeErrorComponent.value || ErrorComponent,
            onCatch: (error: Error) => {
              // Forward not found errors (we don't want to show the error component for these)
              if (isNotFound(error)) {
                error.routeId ??= matchData.value?.routeId
                throw error
              }
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`Warning: Error in route match: ${actualMatchId}`)
              }
              routeOnCatch.value?.(error)
            },
            children: content,
          })
        }

        // Add scroll restoration if needed
        const withScrollRestoration: Array<VNode> = [
          content,
          isChildOfRoot
            ? Vue.h(Vue.Fragment, null, [
                Vue.h(OnRendered),
                router.options.scrollRestoration &&
                (isServer ?? router.isServer)
                  ? Vue.h(ScrollRestoration)
                  : null,
              ])
            : null,
        ].filter(Boolean) as Array<VNode>

        // Return single child directly to avoid Fragment wrapper that causes hydration mismatch
        if (withScrollRestoration.length === 1) {
          return withScrollRestoration[0]!
        }

        return Vue.h(Vue.Fragment, null, withScrollRestoration)
      }

      if (!hasShellComponent.value) {
        return renderMatchContent()
      }

      return Vue.h(ShellComponent.value, null, {
        // Important: return a fresh VNode on each slot invocation so that shell
        // components can re-render without reusing a cached VNode instance.
        default: () => renderMatchContent(),
      })
    }
  },
})

// On Rendered can't happen above the root layout because it actually
// renders a dummy dom element to track the rendered state of the app.
// We render a script tag with a key that changes based on the current
// location state.__TSR_key. Also, because it's below the root layout, it
// allows us to fire onRendered events even after a hydration mismatch
// error that occurred above the root layout (like bad head/link tags,
// which is common).
const OnRendered = Vue.defineComponent({
  name: 'OnRendered',
  setup() {
    const router = useRouter()

    const location = useStore(
      router.stores.resolvedLocation,
      (resolvedLocation) => resolvedLocation?.state.__TSR_key,
    )

    // Track the resolvedLocation as of the last emission so onRendered can
    // report the correct fromLocation. By the time this watcher fires,
    // Transitioner has already advanced resolvedLocation to the new location,
    // so router.stores.resolvedLocation.get() cannot be used as fromLocation.
    // Stored on the router (not a closure) because a cross-route navigation
    // remounts this keyed component, which would otherwise reset the tracker.
    Vue.watch(
      location,
      () => {
        const currentResolvedLocation = router.stores.resolvedLocation.get()
        const previousResolvedLocation = (router as any)
          .__tsrOnRenderedLocation as ParsedLocation | undefined
        if (
          currentResolvedLocation &&
          (!previousResolvedLocation ||
            previousResolvedLocation.href !== currentResolvedLocation.href)
        ) {
          router.emit({
            type: 'onRendered',
            ...getLocationChangeInfo(
              router.stores.location.get(),
              previousResolvedLocation ?? currentResolvedLocation,
            ),
          })
        }
        ;(router as any).__tsrOnRenderedLocation = currentResolvedLocation
      },
      { immediate: true },
    )

    return () => null
  },
})

export const MatchInner = Vue.defineComponent({
  name: 'MatchInner',
  props: {
    matchId: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()

    // Use routeId from context (provided by parent Match) — stable string.
    const routeId = Vue.inject(routeIdContext)!
    const activeMatch = useStore(
      router.stores.getRouteMatchStore(routeId),
      (value) => value,
    )

    // Combined selector for match state AND remount key
    // This ensures both are computed in the same selector call with consistent data
    const combinedState = Vue.computed(() => {
      const match = activeMatch.value
      if (!match) {
        // Route no longer exists - truly navigating away
        return null
      }

      const matchRouteId = match.routeId as string

      // Compute remount key
      const remountFn =
        (router.routesById[matchRouteId] as AnyRoute).options.remountDeps ??
        router.options.defaultRemountDeps

      let remountKey: string | undefined
      if (remountFn) {
        const remountDeps = remountFn({
          routeId: matchRouteId,
          loaderDeps: match.loaderDeps,
          params: match._strictParams,
          search: match._strictSearch,
        })
        remountKey = remountDeps ? JSON.stringify(remountDeps) : undefined
      }

      return {
        routeId: matchRouteId,
        match: {
          id: match.id,
          status: match.status,
          error: match.error,
          ssr: match.ssr,
          _displayPending: match._displayPending,
          _: match._,
        },
        remountKey,
      }
    })

    const route = Vue.computed(() => {
      if (!combinedState.value) return null
      return router.routesById[combinedState.value.routeId]!
    })

    const match = Vue.computed(() => combinedState.value?.match)
    const remountKey = Vue.computed(() => combinedState.value?.remountKey)

    return (): VNode | null => {
      // If match doesn't exist, return null (component is being unmounted or not ready)
      if (!combinedState.value) return null

      // A hydration display match keeps rendering pending UI until the
      // follow-up client load clears the marker, even though its local
      // loadPromise was already settled by hydrate().
      if (match.value!._displayPending) {
        const PendingComponent =
          route.value!.options.pendingComponent ??
          router.options.defaultPendingComponent

        return PendingComponent ? Vue.h(PendingComponent) : null
      }

      if (match.value!.status === 'notFound') {
        // status 'notFound' is only ever committed paired with a NotFoundError
        // (getNotFoundBoundaryPatch), so match.error needs no re-check here.
        return renderRouteNotFound(router, route.value!, match.value!.error)
      }

      if (match.value!.status === 'error') {
        // Check if this route or any parent has an error component
        const RouteErrorComponent =
          route.value!.options.errorComponent ??
          router.options.defaultErrorComponent

        // If this route has an error component, render it directly
        // This is more reliable than relying on Vue's error boundary
        if (RouteErrorComponent) {
          return Vue.h(RouteErrorComponent, {
            error: match.value!.error,
            reset: () => {
              router.invalidate()
            },
            info: {
              componentStack: '',
            },
          })
        }

        // If there's no error component for this route, throw the error
        // so it can bubble up to the nearest parent with an error component
        throw match.value!.error
      }

      if (match.value!.status === 'pending') {
        // In Vue, we render the pending component directly instead of throwing a promise
        // because Vue's Suspense doesn't catch thrown promises like React does
        const PendingComponent =
          route.value.options.pendingComponent ??
          router.options.defaultPendingComponent

        if (PendingComponent) {
          // Vue can render a stale match snapshot after its match-local
          // promise was settled/removed (hydration display matches,
          // cancelMatches) but before the newer lane commits, so a missing
          // local promise is a legitimate state here. Only a still-pending
          // local promise owns pendingMinMs timing.
          const localPromise = Vue.toRaw(match.value!._).loadPromise
          const pendingMinMs =
            route.value!.options.pendingMinMs ??
            router.options.defaultPendingMinMs

          if (
            !(isServer ?? router.isServer) &&
            localPromise?.status === 'pending' &&
            pendingMinMs
          ) {
            localPromise.pendingUntil ??= Date.now() + pendingMinMs
          }

          return Vue.h(PendingComponent)
        }

        // If no pending component, return null while loading
        return null
      }

      // Success status - render the component with remount key
      const Comp =
        route.value!.options.component ?? router.options.defaultComponent
      const key = remountKey.value

      if (Comp) {
        // Pass key as a prop - Vue.h properly handles 'key' as a special prop
        return Vue.h(Comp, key !== undefined ? { key } : undefined)
      }

      return Vue.h(Outlet, key !== undefined ? { key } : undefined)
    }
  },
})

export const Outlet = Vue.defineComponent({
  name: 'Outlet',
  setup() {
    const router = useRouter()
    const parentRouteId = Vue.inject(routeIdContext)

    if (!parentRouteId) {
      return (): VNode | null => null
    }

    // Parent state via stable routeId store — single subscription
    const parentMatch = useStore(
      router.stores.getRouteMatchStore(parentRouteId),
      (v) => v,
    )

    const route = Vue.computed(() =>
      parentMatch.value
        ? router.routesById[parentMatch.value.routeId as string]!
        : undefined,
    )

    const parentGlobalNotFound = Vue.computed(
      () => parentMatch.value?.globalNotFound ?? false,
    )

    // Child match lookup: read the child matchId from the shared derived
    // map (one reactive node for the whole tree), then grab match state
    // directly from the pool.
    const childMatchIdMap = useStore(
      router.stores.childMatchIdByRouteId,
      (v) => v,
    )

    const childMatchData = Vue.computed(() => {
      const childId = childMatchIdMap.value[parentRouteId]
      if (!childId) return null
      const child = router.stores.matchStores.get(childId)?.get()
      if (!child) return null

      return {
        id: child.id,
        // Key based on routeId + params only (not loaderDeps)
        // This ensures component recreates when params change,
        // but NOT when only loaderDeps change
        paramsKey: child.routeId + JSON.stringify(child._strictParams),
      }
    })

    return (): VNode | null => {
      if (parentGlobalNotFound.value) {
        return renderRouteNotFound(router, route.value!, undefined)
      }

      if (!childMatchData.value) {
        return null
      }

      const nextMatch = Vue.h(Match, {
        matchId: childMatchData.value.id,
        key: childMatchData.value.paramsKey,
      })

      // Note: We intentionally do NOT wrap in Suspense here.
      // The top-level Suspense in Matches already covers the root.
      // The old code compared matchId (e.g. "__root__/") with rootRouteId ("__root__")
      // which never matched, so this Suspense was effectively dead code.
      // With routeId-based lookup, parentRouteId === rootRouteId would match,
      // causing a double-Suspense that corrupts Vue's DOM during updates.
      return nextMatch
    }
  },
})
