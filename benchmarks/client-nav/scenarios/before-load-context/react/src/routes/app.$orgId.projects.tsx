import { Outlet, createFileRoute } from '@tanstack/react-router'
import {
  consumeSelectedValue,
  deriveProjectsContext,
  runContextComputation,
} from '../../../shared'

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

  consumeSelectedValue(value, 'projects-context-subscriber')
  return <Outlet />
}
