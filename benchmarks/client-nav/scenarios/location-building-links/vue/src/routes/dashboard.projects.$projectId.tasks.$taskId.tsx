import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const TaskPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()

    return () => (
      <div
        data-route-marker="task"
        data-project-id={params.value.projectId}
        data-task-id={params.value.taskId}
      />
    )
  },
})

export const Route = createFileRoute(
  '/dashboard/projects/$projectId/tasks/$taskId',
)({
  component: TaskPage,
})
