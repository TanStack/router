import * as Vue from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'
import { deriveTaskListContext, runContextComputation } from '../../../shared'
import { consumeSelectedValue } from '../runtime'

const TasksLayout = Vue.defineComponent({
  setup() {
    const value = Route.useRouteContext({
      select: (context) =>
        runContextComputation(context.taskListSeed, context.taskScope, 10),
    })

    return () => {
      consumeSelectedValue(value.value, 'tasks-context-subscriber')
      return <Outlet />
    }
  },
})

export const Route = createFileRoute('/app/$orgId/projects/$projectId/tasks')({
  beforeLoad: ({ context }) => deriveTaskListContext(context),
  component: TasksLayout,
})
