import { For } from 'solid-js'
import { Outlet, createFileRoute } from '@tanstack/solid-router'
import {
  consumeSelectedValue,
  deriveProjectContext,
  middleSubscribers,
  runContextComputation,
} from '../../../shared'
import { PerfValue } from '../runtime'

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

  return (
    <PerfValue
      value={() => consumeSelectedValue(value(), 'project-context-subscriber')}
    />
  )
}

function ProjectLayout() {
  return (
    <>
      <For each={middleSubscribers}>
        {(selector) => <ProjectContextSubscriber selector={selector} />}
      </For>
      <Outlet />
    </>
  )
}
