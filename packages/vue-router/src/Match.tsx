import * as Vue from 'vue'
import { isNotFound, rootRouteId } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useStore } from '@tanstack/vue-store'
import { CatchBoundary } from './CatchBoundary'
import { ClientOnly } from './ClientOnly'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { routeIdContext } from './matchContext'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import type { VNode } from 'vue'
import type { AnyRoute, RootRouteOptions } from '@tanstack/router-core'

export const Match = Vue.defineComponent({
  name: 'Match',
  props: {
    routeId: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()

    const routeId = props.routeId

    const activeMatch = useStore(
      router.stores.getMatchStore(routeId),
      (value) => value,
      { equal: Object.is },
    )
    const matchData = Vue.computed(() => {
      const match = activeMatch.value
      if (!match) {
        return null
      }

      return {
        matchId: match.id,
        routeId,
        ssr: match.ssr,
      }
    })
    // Provide routeId context (stable string) for children.
    // MatchInner, Outlet, and useMatch all consume this.
    Vue.provide(routeIdContext, routeId)

    return (): VNode => {
      const data = matchData.value
      const route = data
        ? (router.routesById[data.routeId] as AnyRoute)
        : undefined
      const PendingComponent =
        route?.options.pendingComponent ??
        router.options.defaultPendingComponent
      const pendingElement = PendingComponent
        ? Vue.h(PendingComponent)
        : undefined
      const routeErrorComponent =
        route?.options.errorComponent ?? router.options.defaultErrorComponent
      const routeOnCatch =
        route?.options.onCatch ?? router.options.defaultOnCatch
      const routeNotFoundComponent = route?.isRoot
        ? (route.options.notFoundComponent ??
          router.options.notFoundRoute?.options.component)
        : route?.options.notFoundComponent
      const ShellComponent = route?.isRoot
        ? ((route.options as RootRouteOptions).shellComponent as any)
        : undefined
      const resolvedNoSsr = data?.ssr === false || data?.ssr === 'data-only'

      const renderMatchContent = (): VNode => {
        const matchInner = Vue.h(MatchInner)

        let content: VNode = resolvedNoSsr
          ? Vue.h(
              ClientOnly,
              {
                fallback: pendingElement,
              },
              {
                default: () => matchInner,
              },
            )
          : matchInner

        // Wrap in NotFound boundary if needed
        if (routeNotFoundComponent) {
          content = Vue.h(CatchNotFound, {
            fallback: (error: any) => {
              error.routeId ??= data!.routeId

              if (error.routeId !== data!.routeId) {
                throw error
              }

              return Vue.h(routeNotFoundComponent, error)
            },
            children: content,
          })
        }

        // Wrap in error boundary if needed
        if (routeErrorComponent) {
          content = CatchBoundary({
            getResetKey: () => activeMatch.value,
            errorComponent: routeErrorComponent,
            onCatch: (error: Error) => {
              // Forward not found errors (we don't want to show the error component for these)
              if (isNotFound(error)) {
                error.routeId ??= data?.routeId
                throw error
              }
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`Warning: Error in route match: ${data?.matchId}`)
              }
              routeOnCatch?.(error)
            },
            children: content,
          })
        }

        // Add scroll restoration if needed
        const withScrollRestoration: Array<VNode> = [
          content,
          route?.parentRoute?.id === rootRouteId
            ? Vue.h(Vue.Fragment, null, [
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

      if (!ShellComponent) {
        return renderMatchContent()
      }

      return Vue.h(ShellComponent, null, {
        // Important: return a fresh VNode on each slot invocation so that shell
        // components can re-render without reusing a cached VNode instance.
        default: () => renderMatchContent(),
      })
    }
  },
})

// On Rendered can't happen above the root layout because it actually
export const MatchInner = Vue.defineComponent({
  name: 'MatchInner',
  setup() {
    const router = useRouter()

    // Use routeId from context (provided by parent Match) — stable string.
    const routeId = Vue.inject(routeIdContext)!
    const activeMatch = useStore(
      router.stores.getMatchStore(routeId),
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

      return [match, remountKey] as const
    })

    return (): VNode | null => {
      // If match doesn't exist, return null (component is being unmounted or not ready)
      const state = combinedState.value
      if (!state) {
        return null
      }
      const [match, remountKey] = state
      const route = router.routesById[match.routeId]!

      // Handle different match statuses
      if (match.status === 'notFound') {
        return renderRouteNotFound(router, route, match.error)
      }

      if (match.status === 'error') {
        // Check if this route or any parent has an error component
        const RouteErrorComponent =
          route.options.errorComponent ?? router.options.defaultErrorComponent

        // If this route has an error component, render it directly
        // This is more reliable than relying on Vue's error boundary
        if (RouteErrorComponent) {
          return Vue.h(RouteErrorComponent, {
            error: match.error,
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
        throw match.error
      }

      if (match.status === 'pending') {
        // In Vue, we render the pending component directly instead of throwing a promise
        // because Vue's Suspense doesn't catch thrown promises like React does
        const PendingComponent =
          route.options.pendingComponent ??
          router.options.defaultPendingComponent

        if (PendingComponent) {
          return Vue.h(PendingComponent)
        }

        // If no pending component, return null while loading
        return null
      }

      // Success status - render the component with remount key
      const Comp = route.options.component ?? router.options.defaultComponent
      if (Comp) {
        // Pass key as a prop - Vue.h properly handles 'key' as a special prop
        return Vue.h(
          Comp,
          remountKey !== undefined ? { key: remountKey } : undefined,
        )
      }

      return Vue.h(
        Outlet,
        remountKey !== undefined ? { key: remountKey } : undefined,
      )
    }
  },
})

export const Outlet = Vue.defineComponent({
  name: 'Outlet',
  setup() {
    const router = useRouter()
    const parentRouteId = Vue.inject(routeIdContext)!

    const parentMatch = useStore(
      router.stores.getMatchStore(parentRouteId),
      (v) => v,
    )

    const route = router.routesById[parentRouteId]!

    const parentGlobalNotFound = Vue.computed(
      () => parentMatch.value?._notFound ?? false,
    )

    const childMatch = useStore(router.stores.matches, (matches) => {
      const index = matches.findIndex(
        (match) => match.routeId === parentRouteId,
      )
      return matches[index + 1]
    })

    const childMatchData = Vue.computed(() => {
      const child = childMatch.value
      if (!child) {
        return null
      }

      return {
        routeId: child.routeId,
        // Key based on routeId + params only (not loaderDeps)
        // This ensures component recreates when params change,
        // but NOT when only loaderDeps change
        paramsKey: child.routeId + JSON.stringify(child._strictParams),
      }
    })

    return (): VNode | null => {
      if (parentGlobalNotFound.value) {
        return renderRouteNotFound(router, route, parentMatch.value!.error)
      }

      if (!childMatchData.value) {
        return null
      }

      const nextMatch = Vue.h(Match, {
        routeId: childMatchData.value.routeId,
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
