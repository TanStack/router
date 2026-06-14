import { Outlet, createFileRoute } from '@tanstack/solid-router'
import { deriveTaskListContext, runContextComputation } from '../../../shared'
import { PerfValue, consumeSelectedValue } from '../runtime'

export const Route = createFileRoute('/app/$orgId/projects/$projectId/tasks')({
  beforeLoad: ({ context }) => deriveTaskListContext(context),
  component: TasksLayout,
})

function TasksLayout() {
  const value = Route.useRouteContext({
    select: (context) =>
      runContextComputation(context.taskListSeed, context.taskScope, 10),
  })

  return (
    <>
      <PerfValue
        value={() => consumeSelectedValue(value(), 'tasks-context-subscriber')}
      />
      <Outlet />
    </>
  )
}
