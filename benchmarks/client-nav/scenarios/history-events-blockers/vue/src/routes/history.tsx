import * as Vue from 'vue'
import type { AnyRouter } from '@tanstack/router-core'
import {
  Outlet,
  createRoute,
  useCanGoBack,
  useRouterState,
} from '@tanstack/vue-router'
import {
  historyEventsBlockersHomePath,
  historyEventsBlockersScenarioSlug,
} from '../../../shared.ts'
import { historyEventsBlockersRuntime } from '../runtime'
import { rootRoute } from './__root'

const CanGoBackProbe = Vue.defineComponent({
  setup(): () => Vue.VNodeChild {
    const canGoBack = useCanGoBack()

    Vue.watchEffect(() => {
      historyEventsBlockersRuntime.recordCanGoBack(canGoBack.value)
    })

    return () => (
      <span
        data-history-events-can-go-back={canGoBack.value ? 'true' : 'false'}
      />
    )
  },
})

const HistoryLayout = Vue.defineComponent({
  setup(): () => Vue.VNodeChild {
    const pathname: Vue.Ref<string> = useRouterState<AnyRouter, string>({
      select: (state) => state.location.pathname,
    })

    return () => (
      <>
        <div data-client-nav-scenario={historyEventsBlockersScenarioSlug} />
        <CanGoBackProbe />
        {pathname.value === historyEventsBlockersHomePath ? (
          <main data-history-events-page="dashboard" />
        ) : null}
        <Outlet />
      </>
    )
  },
})

export const historyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/history',
  component: HistoryLayout,
})
