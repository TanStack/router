import { For } from 'solid-js'
import { createFileRoute } from '@tanstack/solid-router'
import {
  consumeSelectedValue,
  deriveTaskContext,
  leafSubscribers,
  makeTaskChain,
  runContextComputation,
} from '../../../shared'
import { PerfValue } from '../runtime'

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

  return (
    <PerfValue
      value={() => consumeSelectedValue(value(), 'task-context-subscriber')}
    />
  )
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
      <For each={leafSubscribers}>
        {(selector) => <TaskContextSubscriber selector={selector} />}
      </For>
      <div
        data-bench-task="detail"
        data-org-id={context().orgId}
        data-project-id={context().projectId}
        data-task-id={context().taskId}
        data-context-version={context().contextVersion}
        data-task-chain={makeTaskChain(context())}
        data-task-checksum={context().taskChecksum}
      >
        {context().taskMarker}
      </div>
    </>
  )
}
