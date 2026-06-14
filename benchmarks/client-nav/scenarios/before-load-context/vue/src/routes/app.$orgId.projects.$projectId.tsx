import * as Vue from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'
import { deriveProjectContext, runContextComputation } from '../../../shared'
import { consumeSelectedValue, middleSubscribers } from '../runtime'

const ProjectContextSubscriber = Vue.defineComponent({
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
          context.projectChecksum + props.selector,
          context.projectId,
          10,
        ),
    })

    return () => {
      consumeSelectedValue(value.value, 'project-context-subscriber')
      return null
    }
  },
})

const ProjectLayout = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {middleSubscribers.map((selector) => (
          <ProjectContextSubscriber
            key={`project-${selector}`}
            selector={selector}
          />
        ))}
        <Outlet />
      </>
    )
  },
})

export const Route = createFileRoute('/app/$orgId/projects/$projectId')({
  beforeLoad: ({ context, params }) =>
    deriveProjectContext(context, params.projectId),
  component: ProjectLayout,
})
