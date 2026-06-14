import { Outlet, createFileRoute } from '@tanstack/solid-router'
import {
  consumeSelectedValue,
  deriveProjectsContext,
  runContextComputation,
} from '../../../shared'
import { PerfValue } from '../runtime'

export const Route = createFileRoute('/app/$orgId/projects')({
  beforeLoad: ({ context }) => deriveProjectsContext(context),
  component: ProjectsLayout,
})

function ProjectsLayout() {
  const value = Route.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.projectIndexSeed,
        context.breadcrumb[2],
        10,
      ),
  })

  return (
    <>
      <PerfValue
        value={() =>
          consumeSelectedValue(value(), 'projects-context-subscriber')
        }
      />
      <Outlet />
    </>
  )
}
