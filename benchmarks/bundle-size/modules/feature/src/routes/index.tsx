import { createFileRoute, useLocation, useMatch } from '../routeScope.gen'

export const Route = createFileRoute('@benchmarks/feature:/')({
  component: FeatureIndex,
})

// Reads the router through the module's scope: a framework hook and an
// id-based hook that takes the module's own route ids.
function FeatureIndex() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const routeId = useMatch({
    from: '@benchmarks/feature:/',
    select: (match) => match.routeId,
  })
  return (
    <div>
      {routeId} {pathname}
    </div>
  )
}
