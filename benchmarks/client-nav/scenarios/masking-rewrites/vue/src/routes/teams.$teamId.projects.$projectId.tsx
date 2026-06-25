import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { MASKING_ROUTE_MARKERS, MASKING_ROUTE_PATHS } from '../../../shared.ts'
import { rootRoute } from './__root'

const TeamProjectPage = Vue.defineComponent({
  setup() {
    const params = teamProjectRoute.useParams()

    return () => (
      <div
        data-route-marker={MASKING_ROUTE_MARKERS.teamProject}
        data-team-id={params.value.teamId}
        data-project-id={params.value.projectId}
      />
    )
  },
})

export const teamProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MASKING_ROUTE_PATHS.teamProject,
  component: TeamProjectPage,
})
