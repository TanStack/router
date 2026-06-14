import { Outlet, createFileRoute } from '@tanstack/react-router'
import {
  consumeSelectedValue,
  deriveProjectContext,
  middleSubscribers,
  runContextComputation,
} from '../../../shared'

export const Route = createFileRoute('/app/$orgId/projects/$projectId')({
  beforeLoad: ({ context, params }) =>
    deriveProjectContext(context, params.projectId),
  component: ProjectLayout,
})

function ProjectContextSubscriber(props: { selector: number }) {
  const value = Route.useRouteContext({
    select: (context) =>
      runContextComputation(
        context.projectChecksum + props.selector,
        context.projectId,
        10,
      ),
  })

  consumeSelectedValue(value, 'project-context-subscriber')
  return null
}

function ProjectLayout() {
  return (
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
}
