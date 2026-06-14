import * as Vue from 'vue'
import { Outlet, createFileRoute } from '@tanstack/vue-router'
import { deriveProjectsContext, runContextComputation } from '../../../shared'
import { consumeSelectedValue } from '../runtime'

const ProjectsLayout = Vue.defineComponent({
  setup() {
    const value = Route.useRouteContext({
      select: (context) =>
        runContextComputation(
          context.projectIndexSeed,
          context.breadcrumb[2],
          10,
        ),
    })

    return () => {
      consumeSelectedValue(value.value, 'projects-context-subscriber')
      return <Outlet />
    }
  },
})

export const Route = createFileRoute('/app/$orgId/projects')({
  beforeLoad: ({ context }) => deriveProjectsContext(context),
  component: ProjectsLayout,
})
