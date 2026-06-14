import * as Vue from 'vue'
import { Outlet, createRoute, useParams } from '@tanstack/vue-router'
import { createOutletsRemountsProjectMarker } from '../../../shared'
import {
  createRouteLifecycleOptions,
  recordComponentMount,
} from '../outletsRemountsRuntime'
import { createRouteSection } from '../routeSection'
import { projectsRoute } from './workspace.$orgId.projects'

const ProjectLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () => createOutletsRemountsProjectMarker(params.value)
    const mountIndex = recordComponentMount('project', getMarker())

    return () =>
      createRouteSection('project', getMarker(), mountIndex, <Outlet />)
  },
})

export const projectRoute = createRoute({
  getParentRoute: () => projectsRoute,
  path: '$projectId',
  ...createRouteLifecycleOptions('project'),
  remountDeps: ({ params }) => ({
    projectId: params.projectId,
  }),
  component: ProjectLayout,
})
