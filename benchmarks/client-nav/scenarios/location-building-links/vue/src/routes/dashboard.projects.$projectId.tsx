import * as Vue from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'

const ProjectPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()

    return () => (
      <>
        <div
          data-route-marker="project"
          data-project-id={params.value.projectId}
        />
        <Outlet />
      </>
    )
  },
})

export const Route = createFileRoute('/dashboard/projects/$projectId')({
  component: ProjectPage,
})
