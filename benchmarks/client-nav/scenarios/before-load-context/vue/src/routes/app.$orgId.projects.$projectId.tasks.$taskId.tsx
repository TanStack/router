import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
import {
  consumeSelectedValue,
  deriveTaskContext,
  leafSubscribers,
  makeTaskChain,
  runContextComputation,
} from '../../../shared'

const TaskContextSubscriber = Vue.defineComponent({
  props: {
    selector: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = Route.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.taskChecksum + props.selector,
          context.taskMarker,
          10,
        ),
    })

    return () => {
      consumeSelectedValue(value.value, 'task-context-subscriber')
      return null
    }
  },
})

const TaskPage = Vue.defineComponent({
  setup() {
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

    return () => {
      const current = context.value

      return (
        <>
          {leafSubscribers.map((selector) => (
            <TaskContextSubscriber
              key={`task-${selector}`}
              selector={selector}
            />
          ))}
          <div
            data-bench-task="detail"
            data-org-id={current.orgId}
            data-project-id={current.projectId}
            data-task-id={current.taskId}
            data-context-version={current.contextVersion}
            data-task-chain={makeTaskChain(current)}
            data-task-checksum={current.taskChecksum}
          >
            {current.taskMarker}
          </div>
        </>
      )
    }
  },
})

export const Route = createFileRoute(
  '/app/$orgId/projects/$projectId/tasks/$taskId',
)({
  beforeLoad: ({ context, params }) =>
    deriveTaskContext(context, params.taskId),
  component: TaskPage,
})
