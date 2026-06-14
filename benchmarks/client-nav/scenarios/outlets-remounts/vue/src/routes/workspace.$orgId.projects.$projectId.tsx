import * as Vue from 'vue'
import { Outlet, createRoute, useParams } from '@tanstack/vue-router'
import {
  createRouteLifecycleOptions,
  recordComponentMount,
} from '../outletsRemountsRuntime'
import { createRouteSection, readParam } from '../routeSection'
import { projectsRoute } from './workspace.$orgId.projects'

const ProjectLayout = Vue.defineComponent({
  setup() {
    const params = useParams({ strict: false })
    const getMarker = () =>
      `project:${readParam(params.value, 'orgId')}:${readParam(params.value, 'projectId')}`
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
