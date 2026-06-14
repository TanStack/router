import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import { outletsRemountsScenarioSlug } from '../../../shared'
import {
  createRouteLifecycleOptions,
  recordComponentMount,
} from '../outletsRemountsRuntime'
import { createRouteSection } from '../routeSection'
import { rootRoute } from './__root'

const WorkspaceLayout = Vue.defineComponent({
  setup() {
    const marker = 'workspace'
    const mountIndex = recordComponentMount('workspace', marker)

    return () =>
      createRouteSection(
        'workspace',
        marker,
        mountIndex,
        <>
          <div data-client-nav-scenario={outletsRemountsScenarioSlug} />
          <Outlet />
        </>,
      )
  },
})

export const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspace',
  ...createRouteLifecycleOptions('workspace'),
  component: WorkspaceLayout,
})
