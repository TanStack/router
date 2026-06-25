import * as Vue from 'vue'
import { Outlet, createRoute, useParams } from '@tanstack/vue-router'
import {
  createOutletsRemountsMarker,
  readOutletsRemountsParam,
} from '../../../shared'
import {
  createRouteLifecycleOptions,
  recordComponentMount,
} from '../outletsRemountsRuntime'
import { createRouteSection } from '../routeSection'
import { workspaceRoute } from './workspace'

const OrgLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () =>
      createOutletsRemountsMarker({
        kind: 'org',
        orgId: readOutletsRemountsParam(params.value, 'orgId'),
      })
    const mountIndex = recordComponentMount('org', getMarker())

    return () => {
      const marker = getMarker()

      return createRouteSection(
        'org',
        marker,
        mountIndex,
        <>
          <div
            data-outlets-org-marker={marker}
            data-org-id={readOutletsRemountsParam(params.value, 'orgId')}
          />
          <Outlet />
        </>,
      )
    }
  },
})

export const orgRoute = createRoute({
  getParentRoute: () => workspaceRoute,
  path: '$orgId',
  ...createRouteLifecycleOptions('org'),
  component: OrgLayout,
})
