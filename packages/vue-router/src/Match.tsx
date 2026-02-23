import * as Vue from 'vue'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  createControlledPromise,
  getLocationChangeInfo,
  isNotFound,
  isRedirect,
  rootRouteId,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useStore } from './store'
import { CatchBoundary, ErrorComponent } from './CatchBoundary'
import { ClientOnly } from './ClientOnly'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { matchContext, pendingMatchContext } from './matchContext'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import { useStoreOfStoresValue } from './storeOfStores'
import type { VNode } from 'vue'
import type { AnyRoute, RootRouteOptions } from '@tanstack/router-core'

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

    // Track the last known routeId to handle stale props during same-route transitions.
    const lastKnownRouteId = Vue.shallowRef<string | undefined>(undefined)
    const activeMatchesById = useStore(router.stores.byId, (stores) => stores)
    const activeMatchesByRouteId = useStore(
      router.stores.byRouteId,
      (stores) => stores,
    )
    const activeMatchStore = Vue.computed(() => {
      return activeMatchesById.value[props.matchId]
    })
    const fallbackMatchStore = Vue.computed(() => {
      const routeId = lastKnownRouteId.value
      return routeId ? activeMatchesByRouteId.value[routeId] : undefined
    })
    const selectedMatchStore = Vue.computed(
      () => activeMatchStore.value ?? fallbackMatchStore.value,
    )
    const activeMatch = useStoreOfStoresValue(
      selectedMatchStore,
      (value) => value,
    )
    const activeMatchIds = useStore(router.stores.matchesId, (ids) => ids)
    const pendingMatchIds = useStore(
      router.stores.pendingMatchesId,
      (ids) => ids,
    )
    const loadedAt = useStore(router.stores.loadedAt, (value) => value)

    Vue.watchEffect(() => {
      const match = activeMatch.value
      if (match) {
        lastKnownRouteId.value = match.routeId as string
      }
    })

    // Combined selector that returns all needed data including the actual matchId
    // This handles stale props.matchId during same-route transitions
    const matchData = Vue.computed(() => {
      const match = activeMatch.value
      if (!match) {
        return null
      }

      const routeId = match.routeId as string
      const matchIndex = activeMatchIds.value.findIndex((id) => id === match.id)
      const parentMatchId =
        matchIndex > 0 ? activeMatchIds.value[matchIndex - 1] : undefined
      const parentRouteId = parentMatchId
        ? ((router.stores.byId.state[parentMatchId]?.state.routeId as string) ??
          null)
        : null

      return {
        matchId: match.id, // Return the actual matchId (may differ from props.matchId)
        routeId,
        parentRouteId,
        loadedAt: loadedAt.value,
        ssr: match.ssr,
        _displayPending: match._displayPending,
      }
    })

    invariant(
      matchData.value,
      `Could not find routeId for matchId "${props.matchId}". Please file an issue!`,
    )

    const route = Vue.computed(() =>
      matchData.value ? router.routesById[matchData.value.routeId] : null,
    )

    const PendingComponent = Vue.computed(
      () =>
        route.value?.options?.pendingComponent ??
        router?.options?.defaultPendingComponent,
    )

    const pendingElement = Vue.computed(() =>
      PendingComponent.value ? Vue.h(PendingComponent.value) : undefined,
    )

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

    // Create a ref for the current matchId that we provide to child components
    // This ref is updated to the ACTUAL matchId found (which may differ from props during transitions)
    const matchIdRef = Vue.ref(matchData.value?.matchId ?? props.matchId)

    // Watch both props.matchId and matchData to keep matchIdRef in sync
    // This ensures Outlet gets the correct matchId even during transitions
    Vue.watch(
      [() => props.matchId, () => matchData.value?.matchId],
      ([propsMatchId, dataMatchId]) => {
        // Prefer the matchId from matchData (which handles fallback)
        // Fall back to props.matchId if matchData is null
        matchIdRef.value = dataMatchId ?? propsMatchId
      },
      { immediate: true },
    )

    const isPendingMatchRef = Vue.computed(() =>
      pendingMatchIds.value.includes(matchIdRef.value),
    )

    // Provide the matchId to child components
    Vue.provide(matchContext, matchIdRef)
    Vue.provide(pendingMatchContext, isPendingMatchRef)

    return (): VNode => {
      // Use the actual matchId from matchData, not props (which may be stale)
      const actualMatchId = matchData.value?.matchId ?? props.matchId

      const resolvedNoSsr =
        matchData.value?.ssr === false || matchData.value?.ssr === 'data-only'
      const shouldClientOnly =
        resolvedNoSsr || !!matchData.value?._displayPending

      const renderMatchContent = (): VNode => {
        const matchInner = Vue.h(MatchInner, { matchId: actualMatchId })

        let content: VNode = shouldClientOnly
          ? Vue.h(
              ClientOnly,
              {
                fallback: pendingElement.value,
              },
              {
                default: () => matchInner,
              },
            )
          : matchInner

        // Wrap in NotFound boundary if needed
        if (routeNotFoundComponent.value) {
          content = Vue.h(CatchNotFound, {
            fallback: (error: any) => {
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
              if (isNotFound(error)) throw error
              warning(false, `Error in route match: ${actualMatchId}`)
              routeOnCatch.value?.(error)
            },
            children: content,
          })
        }

        // Add scroll restoration if needed
        const withScrollRestoration: Array<VNode> = [
          content,
          matchData.value?.parentRouteId === rootRouteId &&
          router.options.scrollRestoration
            ? Vue.h(Vue.Fragment, null, [
                Vue.h(OnRendered),
                Vue.h(ScrollRestoration),
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
// location state.key. Also, because it's below the root layout, it
// allows us to fire onRendered events even after a hydration mismatch
// error that occurred above the root layout (like bad head/link tags,
// which is common).
const OnRendered = Vue.defineComponent({
  name: 'OnRendered',
  setup() {
    const router = useRouter()

    const location = useStore(
      router.stores.resolvedLocation,
      (resolvedLocation) => resolvedLocation?.state.key,
    )

    Vue.watchEffect(() => {
      if (location.value) {
        router.emit({
          type: 'onRendered',
          ...getLocationChangeInfo(router.state),
        })
      }
    })

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
    const lastKnownRouteId = Vue.shallowRef<string | undefined>(undefined)
    const activeMatchesById = useStore(router.stores.byId, (stores) => stores)
    const activeMatchesByRouteId = useStore(
      router.stores.byRouteId,
      (stores) => stores,
    )
    const activeMatchStore = Vue.computed(() => {
      return activeMatchesById.value[props.matchId]
    })
    const fallbackMatchStore = Vue.computed(() => {
      const routeId = lastKnownRouteId.value
      return routeId ? activeMatchesByRouteId.value[routeId] : undefined
    })
    const selectedMatchStore = Vue.computed(
      () => activeMatchStore.value ?? fallbackMatchStore.value,
    )
    const activeMatch = useStoreOfStoresValue(
      selectedMatchStore,
      (value) => value,
    )

    Vue.watchEffect(() => {
      const match = activeMatch.value
      if (match) {
        lastKnownRouteId.value = match.routeId as string
      }
    })

    // Combined selector for match state AND remount key
    // This ensures both are computed in the same selector call with consistent data
    const combinedState = Vue.computed(() => {
      const match = activeMatch.value
      if (!match) {
        // Route no longer exists - truly navigating away
        return null
      }

      const routeId = match.routeId as string

      // Compute remount key
      const remountFn =
        (router.routesById[routeId] as AnyRoute).options.remountDeps ??
        router.options.defaultRemountDeps

      let remountKey: string | undefined
      if (remountFn) {
        const remountDeps = remountFn({
          routeId,
          loaderDeps: match.loaderDeps,
          params: match._strictParams,
          search: match._strictSearch,
        })
        remountKey = remountDeps ? JSON.stringify(remountDeps) : undefined
      }

      return {
        routeId,
        match: {
          id: match.id,
          status: match.status,
          error: match.error,
          ssr: match.ssr,
          _forcePending: match._forcePending,
          _displayPending: match._displayPending,
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
      if (!combinedState.value || !match.value || !route.value) return null

      // Handle different match statuses
      if (match.value._displayPending) {
        const PendingComponent =
          route.value.options.pendingComponent ??
          router.options.defaultPendingComponent

        return PendingComponent ? Vue.h(PendingComponent) : null
      }

      if (match.value._forcePending) {
        const PendingComponent =
          route.value.options.pendingComponent ??
          router.options.defaultPendingComponent

        return PendingComponent ? Vue.h(PendingComponent) : null
      }

      if (match.value.status === 'notFound') {
        invariant(isNotFound(match.value.error), 'Expected a notFound error')
        return renderRouteNotFound(router, route.value, match.value.error)
      }

      if (match.value.status === 'redirected') {
        invariant(isRedirect(match.value.error), 'Expected a redirect error')
        throw router.getMatch(match.value.id)?._nonReactive.loadPromise
      }

      if (match.value.status === 'error') {
        // Check if this route or any parent has an error component
        const RouteErrorComponent =
          route.value.options.errorComponent ??
          router.options.defaultErrorComponent

        // If this route has an error component, render it directly
        // This is more reliable than relying on Vue's error boundary
        if (RouteErrorComponent) {
          return Vue.h(RouteErrorComponent, {
            error: match.value.error,
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
        throw match.value.error
      }

      if (match.value.status === 'pending') {
        const pendingMinMs =
          route.value.options.pendingMinMs ?? router.options.defaultPendingMinMs

        const routerMatch = router.getMatch(match.value.id)
        if (
          pendingMinMs &&
          routerMatch &&
          !routerMatch._nonReactive.minPendingPromise
        ) {
          // Create a promise that will resolve after the minPendingMs
          if (!(isServer ?? router.isServer)) {
            const minPendingPromise = createControlledPromise<void>()

            routerMatch._nonReactive.minPendingPromise = minPendingPromise

            setTimeout(() => {
              minPendingPromise.resolve()
              // We've handled the minPendingPromise, so we can delete it
              routerMatch._nonReactive.minPendingPromise = undefined
            }, pendingMinMs)
          }
        }

        // In Vue, we render the pending component directly instead of throwing a promise
        // because Vue's Suspense doesn't catch thrown promises like React does
        const PendingComponent =
          route.value.options.pendingComponent ??
          router.options.defaultPendingComponent

        if (PendingComponent) {
          return Vue.h(PendingComponent)
        }

        // If no pending component, return null while loading
        return null
      }

      // Success status - render the component with remount key
      const Comp =
        route.value.options.component ?? router.options.defaultComponent
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
    const matchId = Vue.inject(matchContext)
    const safeMatchId = Vue.computed(() => matchId?.value || '')
    const activeMatchIds = useStore(router.stores.matchesId, (ids) => ids)
    const activeMatchesById = useStore(router.stores.byId, (stores) => stores)
    const parentMatchStore = Vue.computed(() => {
      const id = safeMatchId.value
      return id ? activeMatchesById.value[id] : undefined
    })

    const routeId = useStoreOfStoresValue(
      parentMatchStore,
      (parentMatch) => parentMatch?.routeId as string | undefined,
    )

    const route = Vue.computed(() =>
      routeId.value ? router.routesById[routeId.value]! : undefined,
    )

    const parentGlobalNotFound = useStoreOfStoresValue(
      parentMatchStore,
      (parentMatch) => parentMatch?.globalNotFound ?? false,
    )

    const childMatchId = Vue.computed(() => {
      const index = activeMatchIds.value.findIndex(
        (id) => id === safeMatchId.value,
      )
      return activeMatchIds.value[index + 1]
    })

    const childMatchStore = Vue.computed(() => {
      const id = childMatchId.value
      return id ? activeMatchesById.value[id] : undefined
    })

    const childMatch = useStoreOfStoresValue(childMatchStore, (value) => value)

    const childMatchData = Vue.computed(() => {
      const child = childMatch.value
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
        if (!route.value) {
          return null
        }
        return renderRouteNotFound(router, route.value, undefined)
      }

      if (!childMatchData.value) {
        return null
      }

      const nextMatch = Vue.h(Match, {
        matchId: childMatchData.value.id,
        key: childMatchData.value.paramsKey,
      })

      if (safeMatchId.value === rootRouteId) {
        return Vue.h(
          Vue.Suspense,
          {
            fallback: router.options.defaultPendingComponent
              ? Vue.h(router.options.defaultPendingComponent)
              : null,
          },
          {
            default: () => nextMatch,
          },
        )
      }

      return nextMatch
    }
  },
})
