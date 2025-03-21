import * as Vue from 'vue'
import invariant from 'tiny-invariant'
import warning from 'tiny-warning'
import {
  createControlledPromise,
  getLocationChangeInfo,
  isNotFound,
  isRedirect,
  pick,
  rootRouteId,
} from '@tanstack/router-core'
import { ErrorComponent } from './CatchBoundary'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { CatchNotFound } from './not-found'
import { matchContext } from './matchContext'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import { SafeFragment } from './SafeFragment'
import type { VNode } from 'vue'
import type { AnyRoute } from '@tanstack/router-core'

export const Match = Vue.defineComponent({
  name: 'Match',
  props: {
    matchId: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const router = useRouter()
    const routeId = useRouterState({
      select: (s) => {
        return s.matches.find((d) => d.id === props.matchId)?.routeId as string
      },
    })

    invariant(
      routeId.value,
      `Could not find routeId for matchId "${props.matchId}". Please file an issue!`,
    )

    const route = Vue.computed(() => router.routesById[routeId.value])

    const PendingComponent = Vue.computed(() =>
      route.value?.options?.pendingComponent ?? router?.options?.defaultPendingComponent
    )

    const routeErrorComponent = Vue.computed(() =>
      route.value?.options?.errorComponent ?? router?.options?.defaultErrorComponent
    )

    const routeOnCatch = Vue.computed(() =>
      route.value?.options?.onCatch ?? router?.options?.defaultOnCatch
    )

    const routeNotFoundComponent = Vue.computed(() =>
      route.value?.isRoot
        ? // If it's the root route, use the globalNotFound option, with fallback to the notFoundRoute's component
          (route.value?.options?.notFoundComponent ??
          router?.options?.notFoundRoute?.options?.component)
        : route.value?.options?.notFoundComponent
    )

    const resetKey = useRouterState({
      select: (s) => s.loadedAt,
    })

    const parentRouteId = useRouterState({
      select: (s) => {
        const index = s.matches.findIndex((d) => d.id === props.matchId)
        return s.matches[index - 1]?.routeId as string
      },
    })

    // Create a ref for the current matchId that we can provide to child components
    const matchIdRef = Vue.ref(props.matchId)
    
    // When props.matchId changes, update the ref
    Vue.watch(() => props.matchId, (newMatchId) => {
      matchIdRef.value = newMatchId
    }, { immediate: true })

    // Provide the matchId to child components
    Vue.provide(matchContext, matchIdRef)

    return (): VNode => {
      // Determine which components to render
      let content: VNode = Vue.h(MatchInner, { matchId: props.matchId })
      
      // Wrap in NotFound boundary if needed
      if (routeNotFoundComponent.value) {
        content = Vue.h(CatchNotFound, {
          fallback: (error: any) => {
            // If the current not found handler doesn't exist or it has a
            // route ID which doesn't match the current route, rethrow the error
            if (
              !routeNotFoundComponent.value ||
              (error.routeId && error.routeId !== routeId.value) ||
              (!error.routeId && route.value && !route.value.isRoot)
            )
              throw error

            return Vue.h(routeNotFoundComponent.value, error)
          },
          children: content
        })
      }

      // Wrap in error boundary if needed
      if (routeErrorComponent.value) {
        content = Vue.h(ErrorComponent, {
          getResetKey: () => resetKey.value,
          errorComponent: routeErrorComponent.value,
          onCatch: (error: Error) => {
            // Forward not found errors (we don't want to show the error component for these)
            if (isNotFound(error)) throw error
            warning(false, `Error in route match: ${props.matchId}`)
            routeOnCatch.value?.(error)
          },
          children: content
        })
      }

      // Wrap in suspense if needed
      const needsSuspense = (route.value && (!route.value.isRoot || route.value.options.wrapInSuspense)) &&
        (route.value?.options?.wrapInSuspense ?? PendingComponent.value ?? false)
      
      if (needsSuspense) {
        content = Vue.h(Vue.Suspense, {
          fallback: PendingComponent.value ? Vue.h(PendingComponent.value) : null 
        }, {
          default: () => content
        })
      }

      // Add scroll restoration if needed
      const withScrollRestoration: VNode[] = [
        content,
        parentRouteId.value === rootRouteId && router.options.scrollRestoration 
          ? Vue.h(Vue.Fragment, null, [
              Vue.h(OnRendered),
              Vue.h(ScrollRestoration)
            ]) 
          : null
      ].filter(Boolean) as VNode[]

      return Vue.h(Vue.Fragment, null, withScrollRestoration)
    }
  }
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

    const location = useRouterState({
      select: (s) => {
        return s.resolvedLocation?.state.key
      },
    })
    
    Vue.watchEffect(() => {
      if (location.value) {
        router.emit({
          type: 'onRendered',
          ...getLocationChangeInfo(router.state),
        })
      }
    })
    
    return () => null
  }
})

export const MatchInner = Vue.defineComponent({
  name: 'MatchInner',
  props: {
    matchId: {
      type: String, 
      required: true
    }
  },
  setup(props) {
    const router = useRouter()

    // { match, key, routeId } =
    const matchState = useRouterState({
      select: (s) => {
        const matchIndex = s.matches.findIndex((d) => d.id === props.matchId)
        const match = s.matches[matchIndex]!
        const routeId = match.routeId as string

        const remountFn =
          (router.routesById[routeId] as AnyRoute).options.remountDeps ??
          router.options.defaultRemountDeps
        const remountDeps = remountFn?.({
          routeId,
          loaderDeps: match.loaderDeps,
          params: match._strictParams,
          search: match._strictSearch,
        })
        const key = remountDeps ? JSON.stringify(remountDeps) : undefined

        return {
          key,
          routeId,
          match: pick(match, ['id', 'status', 'error']),
        }
      },
    })

    const route = Vue.computed(() => router.routesById[matchState.value.routeId]!)

    const match = Vue.computed(() => matchState.value.match)

    const out = Vue.computed((): VNode => {
      const Comp = route.value.options.component ?? router.options.defaultComponent
      if (Comp) {
        return Vue.h(Comp)
      }
      return Vue.h(Outlet)
    })
    
    return (): VNode | null => {
      // Handle different match statuses
      if (match.value.status === 'notFound') {
        invariant(isNotFound(match.value.error), 'Expected a notFound error')
        return renderRouteNotFound(router, route.value, match.value.error)
      }
      
      if (match.value.status === 'redirected') {
        invariant(isRedirect(match.value.error), 'Expected a redirect error')
        throw router.getMatch(match.value.id)?.loadPromise
      }
      
      if (match.value.status === 'error') {
        if (router.isServer) {
          const RouteErrorComponent =
            (route.value.options.errorComponent ??
              router.options.defaultErrorComponent) ||
            ErrorComponent
  
          return Vue.h(RouteErrorComponent, {
            error: match.value.error,
            info: {
              componentStack: '',
            }
          })
        }
  
        throw match.value.error
      }
      
      if (match.value.status === 'pending') {
        const pendingMinMs =
          route.value.options.pendingMinMs ?? router.options.defaultPendingMinMs
  
        if (pendingMinMs && !router.getMatch(match.value.id)?.minPendingPromise) {
          // Create a promise that will resolve after the minPendingMs
          if (!router.isServer) {
            const minPendingPromise = createControlledPromise<void>()
  
            Promise.resolve().then(() => {
              router.updateMatch(match.value.id, (prev) => ({
                ...prev,
                minPendingPromise,
              }))
            })
  
            setTimeout(() => {
              minPendingPromise.resolve()
  
              // We've handled the minPendingPromise, so we can delete it
              router.updateMatch(match.value.id, (prev) => ({
                ...prev,
                minPendingPromise: undefined,
              }))
            }, pendingMinMs)
          }
        }
        
        throw router.getMatch(match.value.id)?.loadPromise
      }
      
      // Success status - render the component
      return out.value
    }
  }
})

export const Outlet = Vue.defineComponent({
  name: 'Outlet',
  setup() {
    const router = useRouter()
    const matchId = Vue.inject(matchContext)
    const safeMatchId = Vue.computed(() => matchId?.value || '')
    
    const routeId = useRouterState({
      select: (s) => s.matches.find((d) => d.id === safeMatchId.value)?.routeId as string,
    })

    const route = Vue.computed(() => router.routesById[routeId.value]!)

    const parentGlobalNotFound = useRouterState({
      select: (s) => {
        const matches = s.matches
        const parentMatch = matches.find((d) => d.id === safeMatchId.value)
        invariant(
          parentMatch,
          `Could not find parent match for matchId "${safeMatchId.value}"`,
        )
        return parentMatch.globalNotFound
      },
    })

    const childMatchId = useRouterState({
      select: (s) => {
        const matches = s.matches
        const index = matches.findIndex((d) => d.id === safeMatchId.value)
        return matches[index + 1]?.id
      },
    })

    return (): VNode | null => {
      if (parentGlobalNotFound.value) {
        return renderRouteNotFound(router, route.value, undefined)
      }
      
      if (!childMatchId.value) {
        return null
      }
      
      const nextMatch = Vue.h(Match, { matchId: childMatchId.value })
      
      if (safeMatchId.value === rootRouteId) {
        return Vue.h(Vue.Suspense, {
          fallback: router.options.defaultPendingComponent ? 
            Vue.h(router.options.defaultPendingComponent) : null
        }, {
          default: () => nextMatch
        })
      }
      
      return nextMatch
    }
  }
})
