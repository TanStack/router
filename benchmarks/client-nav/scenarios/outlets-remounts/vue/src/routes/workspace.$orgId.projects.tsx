import * as Vue from 'vue'
import { Outlet, createRoute, useParams } from '@tanstack/vue-router'
import { createOutletsRemountsProjectsMarker } from '../../../shared'
import {
  createRouteLifecycleOptions,
  recordComponentMount,
} from '../outletsRemountsRuntime'
import { createRouteSection } from '../routeSection'
import { orgRoute } from './workspace.$orgId'

const ProjectsLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () => createOutletsRemountsProjectsMarker(params.value)
    const mountIndex = recordComponentMount('projects', getMarker())

    return () =>
      createRouteSection('projects', getMarker(), mountIndex, <Outlet />)
  },
})

export const projectsRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: 'projects',
  ...createRouteLifecycleOptions('projects'),
  component: ProjectsLayout,
})
