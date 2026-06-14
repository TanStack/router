import * as Vue from 'vue'
import { Outlet, createRoute, useRouterState } from '@tanstack/vue-router'
import {
  interruptedNavigationHomePath,
  interruptedNavigationScenarioSlug,
} from '../../../shared.ts'
import { rootRoute } from './__root'

const InterruptLayout: ReturnType<typeof Vue.defineComponent> =
  Vue.defineComponent({
    setup() {
      const pathname = useRouterState({
        select: (state) => state.location.pathname,
      })

      return () => (
        <>
          <div data-client-nav-scenario={interruptedNavigationScenarioSlug} />
          {pathname.value === interruptedNavigationHomePath ? (
            <main data-interrupted-page="home" />
          ) : null}
          <Outlet />
        </>
      )
    },
  })

export const interruptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/interrupt',
  component: InterruptLayout,
})
