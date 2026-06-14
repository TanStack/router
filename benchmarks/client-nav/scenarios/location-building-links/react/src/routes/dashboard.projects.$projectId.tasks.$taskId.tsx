import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/dashboard/projects/$projectId/tasks/$taskId',
)({
  component: TaskPage,
})

function TaskPage() {
  const params = Route.useParams()

  return (
    <div
      data-route-marker="task"
      data-project-id={params.projectId}
      data-task-id={params.taskId}
    />
  )
}
