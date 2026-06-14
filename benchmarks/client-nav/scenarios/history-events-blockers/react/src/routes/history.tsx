import {
  Outlet,
  createRoute,
  useCanGoBack,
  useRouterState,
} from '@tanstack/react-router'
import {
  historyEventsBlockersHomePath,
  historyEventsBlockersScenarioSlug,
} from '../../../shared.ts'
import { historyEventsBlockersRuntime } from '../runtime'
import { rootRoute } from './__root'

export const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history',
  component: HistoryLayout,
})

function HistoryLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <>
      <div data-client-nav-scenario={historyEventsBlockersScenarioSlug} />
      <CanGoBackProbe />
      {pathname === historyEventsBlockersHomePath ? (
        <main data-history-events-page="dashboard" />
      ) : null}
      <Outlet />
    </>
  )
}

function CanGoBackProbe() {
  const canGoBack = useCanGoBack()
  historyEventsBlockersRuntime.recordCanGoBack(canGoBack)

  return <span data-history-events-can-go-back={canGoBack ? 'true' : 'false'} />
}
