import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { rootRoute } from './__root'

const TeamProjectPage = Vue.defineComponent({
  setup() {
    const params = teamProjectRoute.useParams()

    return () => (
      <div
        data-route-marker="team-project"
        data-team-id={params.value.teamId}
        data-project-id={params.value.projectId}
      />
    )
  },
})

export const teamProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/teams/$teamId/projects/$projectId',
  component: TeamProjectPage,
})
