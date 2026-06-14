import { Outlet, createFileRoute } from '@tanstack/react-router'
import {
  consumeSelectedValue,
  deriveTaskListContext,
  runContextComputation,
} from '../../../shared'

export const Route = createFileRoute('/app/$orgId/projects/$projectId/tasks')({
  beforeLoad: ({ context }) => deriveTaskListContext(context),
  component: TasksLayout,
})

function TasksLayout() {
  const value = Route.useRouteContext({
    select: (context) =>
      runContextComputation(context.taskListSeed, context.taskScope, 10),
  })

  consumeSelectedValue(value, 'tasks-context-subscriber')
  return <Outlet />
}
