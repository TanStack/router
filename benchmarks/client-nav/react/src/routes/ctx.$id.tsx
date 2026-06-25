import { createFileRoute } from '@tanstack/react-router'
import { routeSelectors, runPerfSelectorComputation } from '../shared'

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

  void runPerfSelectorComputation(params)
  return null
}

function ContextRouteSubscriber() {
  const context = Route.useRouteContext({
    select: (context) => runPerfSelectorComputation(context.sectionSeed),
  })

  void runPerfSelectorComputation(context)
  return null
}

function ContextPage() {
  return (
    <>
      {routeSelectors.map((selector) => (
        <ContextParamsSubscriber key={`context-params-${selector}`} />
      ))}
      {routeSelectors.map((selector) => (
        <ContextRouteSubscriber key={`context-route-${selector}`} />
      ))}
    </>
  )
}
