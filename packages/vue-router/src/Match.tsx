import * as Vue from 'vue'
import { isNotFound, rootRouteId } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useSelector } from '@tanstack/vue-store'
import { CatchBoundary } from './CatchBoundary'
import { ClientOnly } from './ClientOnly'
import { useRouter, useRouterContext } from './useRouter'
import { CatchNotFound } from './not-found'
import { routerContext } from './routerContext'
import { renderRouteNotFound } from './renderRouteNotFound'
import { ScrollRestoration } from './scroll-restoration'
import {
  nonRouteComponentContext,
  renderInNonRouteComponentContext,
} from './nonRouteComponentContext'
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

    const matchStore = router.stores.getMatchStore(routeId)
    const activeMatch =
      (isServer ?? router.isServer)
        ? Vue.toRef(() => matchStore.get())
        : useSelector(matchStore, (value) => value, { compare: Object.is })
    // Shell, fallback and route children share this keyed visit's source.
    Vue.provide(routerContext, matchStore.location!)

    return (): VNode => {
      const match = activeMatch.value
      const route = match ? (router.routesById[routeId] as AnyRoute) : undefined
      const PendingComponent =
        route?.options.pendingComponent ??
        router.options.defaultPendingComponent
      const pendingElement = PendingComponent
        ? process.env.NODE_ENV !== 'production'
          ? renderInNonRouteComponentContext(
              PendingComponent,
              undefined,
              'pendingComponent',
            )
          : Vue.h(PendingComponent)
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
      const resolvedNoSsr = match?.ssr === false || match?.ssr === 'data-only'

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
              error.routeId ??= routeId

              if (error.routeId !== routeId) {
                throw error
              }

              return process.env.NODE_ENV !== 'production'
                ? renderInNonRouteComponentContext(
                    routeNotFoundComponent,
                    error,
                    'notFoundComponent',
                  )
                : Vue.h(routeNotFoundComponent, error)
            },
            children: content,
          })
        }

        // Wrap in error boundary if needed
        if (routeErrorComponent) {
          content = CatchBoundary({
            getResetKey: () => activeMatch.value,
            errorComponent: routeErrorComponent,
            onCatch: (error: unknown) => {
              // Forward not found errors (we don't want to show the error component for these)
              if (isNotFound(error)) {
                error.routeId ??= routeId
                throw error
              }
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`Warning: Error in route match: ${match?.id}`)
              }
              routeOnCatch?.(error)
            },
            children: content,
          })
        }

        if (route?.parentRoute?.id !== rootRouteId) {
          return content
        }

        return Vue.h(Vue.Fragment, null, [
          content,
          (isServer ?? router.isServer) && router.options.scrollRestoration
            ? Vue.h(ScrollRestoration)
            : null,
        ])
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

    const routeId = useRouterContext()![2]!
    const matchStore = router.stores.getMatchStore(routeId)
    const activeMatch =
      (isServer ?? router.isServer)
        ? Vue.toRef(() => matchStore.get())
        : useSelector(matchStore)

    // Combined selector for match state AND remount key
    // This ensures both are computed in the same selector call with consistent data
    const getCombinedState = () => {
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

      const remountKey = remountFn
        ? JSON.stringify(
            remountFn({
              routeId: matchRouteId,
              loaderDeps: match.loaderDeps,
              params: match._strictParams,
              search: match._strictSearch,
            }),
          )
        : undefined

      return [match, remountKey] as const
    }
    const combinedState =
      (isServer ?? router.isServer)
        ? Vue.toRef(getCombinedState)
        : Vue.computed(getCombinedState)

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
          const errorProps = {
            error: match.error,
            reset: () => {
              router.invalidate()
            },
            info: {
              componentStack: '',
            },
          }
          return process.env.NODE_ENV !== 'production'
            ? renderInNonRouteComponentContext(
                RouteErrorComponent,
                errorProps,
                'errorComponent',
              )
            : Vue.h(RouteErrorComponent, errorProps)
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
          return process.env.NODE_ENV !== 'production'
            ? renderInNonRouteComponentContext(
                PendingComponent,
                undefined,
                'pendingComponent',
              )
            : Vue.h(PendingComponent)
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
    if (
      !(isServer ?? router.isServer) &&
      process.env.NODE_ENV !== 'production'
    ) {
      const nonRouteComponent = Vue.inject(nonRouteComponentContext!, undefined)
      if (nonRouteComponent) {
        Vue.watch(
          nonRouteComponent,
          (component) => {
            console.warn(
              `Warning: An <Outlet /> was rendered inside a ${component}. <Outlet /> should only be rendered inside a route component.`,
            )
          },
          { immediate: true },
        )
      }
    }

    const parentRouteId = useRouterContext()![2]!

    const parentStore = router.stores.getMatchStore(parentRouteId)
    const parentMatch =
      (isServer ?? router.isServer)
        ? Vue.toRef(() => parentStore.get())
        : useSelector(parentStore)

    const route = router.routesById[parentRouteId]!

    const selectChildRouteId = (
      matches: ReturnType<typeof router.stores.matches.get>,
    ) => {
      const index = matches.findIndex(
        (match) => match.routeId === parentRouteId,
      )
      return matches[index + 1]?.routeId
    }
    const childRouteId =
      (isServer ?? router.isServer)
        ? Vue.toRef(() => selectChildRouteId(router.stores.matches.get()))
        : useSelector(router.stores.matches, selectChildRouteId)

    return (): VNode | null => {
      if (parentMatch.value?._notFound) {
        return renderRouteNotFound(router, route, parentMatch.value.error)
      }

      const child = childRouteId.value
      if (!child) {
        return null
      }

      const nextMatch = Vue.h(Match, {
        routeId: child,
        key: child,
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
