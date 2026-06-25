import { createFileRoute } from '@tanstack/react-router'
import {
  consumeSelectedValue,
  deriveTaskContext,
  leafSubscribers,
  makeTaskChain,
  runContextComputation,
} from '../../../shared'

export const Route = createFileRoute(
  '/app/$orgId/projects/$projectId/tasks/$taskId',
)({
  beforeLoad: ({ context, params }) =>
    deriveTaskContext(context, params.taskId),
  component: TaskPage,
})

function TaskContextSubscriber(props: { selector: number }) {
  const value = Route.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.taskChecksum + props.selector,
        context.taskMarker,
        10,
      ),
  })

  consumeSelectedValue(value, 'task-context-subscriber')
  return null
}

function TaskPage() {
  const context = Route.useRouteContext({
    select: (context) => ({
      orgId: context.orgId,
      projectId: context.projectId,
      taskId: context.taskId,
      contextVersion: context.contextVersion,
      taskChecksum: context.taskChecksum,
      taskMarker: context.taskMarker,
    }),
  })

  return (
    <>
      {leafSubscribers.map((selector) => (
        <TaskContextSubscriber key={`task-${selector}`} selector={selector} />
      ))}
      <div
        data-bench-task="detail"
        data-org-id={context.orgId}
        data-project-id={context.projectId}
        data-task-id={context.taskId}
        data-context-version={context.contextVersion}
        data-task-chain={makeTaskChain(context)}
        data-task-checksum={context.taskChecksum}
      >
        {context.taskMarker}
      </div>
    </>
  )
}
