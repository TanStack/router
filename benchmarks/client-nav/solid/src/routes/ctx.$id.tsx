import { For } from 'solid-js'
import { createFileRoute } from '@tanstack/solid-router'
import { PerfValue, routeSelectors, runPerfSelectorComputation } from '../shared'

export const Route = createFileRoute('/ctx/$id')({
  beforeLoad: ({ params }) => ({
    sectionSeed: Number(params.id) * 13 + 1,
  }),
  component: ContextPage,
})

function ContextParamsSubscriber() {
  const params = Route.useParams({
    select: (params) => runPerfSelectorComputation(Number(params.id)),
  })

  return <PerfValue value={() => runPerfSelectorComputation(params())} />
}

function ContextRouteSubscriber() {
  const context = Route.useRouteContext({
    select: (context) => runPerfSelectorComputation(context.sectionSeed),
  })

  return <PerfValue value={() => runPerfSelectorComputation(context())} />
}

function ContextPage() {
  return (
    <>
      <For each={routeSelectors}>{() => <ContextParamsSubscriber />}</For>
      <For each={routeSelectors}>{() => <ContextRouteSubscriber />}</For>
    </>
  )
}
