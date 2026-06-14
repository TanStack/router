import { Outlet, createRoute, useRouterState } from '@tanstack/react-router'
import {
  interruptedNavigationHomePath,
  interruptedNavigationScenarioSlug,
} from '../../../shared.ts'
import { rootRoute } from './__root'

export const interruptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/interrupt',
  component: InterruptLayout,
})

function InterruptLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return (
    <>
      <div data-client-nav-scenario={interruptedNavigationScenarioSlug} />
      {pathname === interruptedNavigationHomePath ? (
        <main data-interrupted-page="home" />
      ) : null}
      <Outlet />
    </>
  )
}
