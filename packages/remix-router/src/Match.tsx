/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import './extensions'
import { isNotFound, isRedirect } from '@tanstack/router-core'
import { MatchContext } from './MatchContext'
import { useRouter } from './useRouter'
import { subscribeDynamicStore } from './subscribe'
import { Outlet } from './Outlet'
import { renderRouteNotFound } from './renderRouteNotFound'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { AnyRoute } from '@tanstack/router-core'

export interface MatchProps {
  matchId: string
}

/**
 * Render a single route match. The match store is looked up by the
 * current `matchId` prop on every render — using `subscribeDynamicStore`
 * so subscriptions follow the prop. That's important on client-side
 * navigations: when `<Outlet>` re-renders with a new `matchId`, the
 * existing `<Match>` component instance keeps its handle (Remix UI
 * reuses same-type vnodes during diff), but its prop changes; the
 * dynamic subscription re-binds to the right store automatically.
 */
export function Match(handle: Handle<MatchProps>) {
  const router = useRouter(handle)
  const readMatch = subscribeDynamicStore(handle, () =>
    router.stores.matchStores.get(handle.props.matchId),
  )

  return (): RemixNode => {
    const match = readMatch() as any
    if (!match) {
      return null
    }
    const route = router.routesById[match.routeId as string] as AnyRoute

    if (match.status === 'pending') {
      const Pending =
        route.options.pendingComponent ?? router.options.defaultPendingComponent
      return Pending ? <Pending /> : null
    }

    if (match.status === 'error') {
      const ErrorComponent =
        route.options.errorComponent ?? router.options.defaultErrorComponent
      if (ErrorComponent) {
        return (
          <ErrorComponent
            error={match.error}
            reset={() => {
              void router.invalidate()
            }}
            info={{ componentStack: '' }}
          />
        )
      }
      return <pre>{(match.error as Error).message ?? String(match.error)}</pre>
    }

    if (match.status === 'notFound') {
      // `renderRouteNotFound` runs the canonical resolution chain:
      // route's `notFoundComponent` → router's `defaultNotFoundComponent`
      // → built-in fallback (with a dev warning when neither is set).
      // Same shape solid-router and vue-router use internally.
      if (isNotFound(match.error)) {
        return renderRouteNotFound(router, route, match.error)
      }
      return renderRouteNotFound(router, route, undefined)
    }

    if (match.status === 'redirected') {
      // The router will navigate away; render nothing in the meantime.
      if (isRedirect(match.error)) return null
      return null
    }

    const Component =
      route.options.component ?? router.options.defaultComponent ?? Outlet

    return (
      <MatchContext matchId={handle.props.matchId}>
        <Component />
      </MatchContext>
    )
  }
}
