import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/skip-on-parse-error/$slug')({
  // No params.parse - this is the catch-all fallback
  // Still has skipRouteOnParseError to participate in the competition
  skipRouteOnParseError: true,
  component: CatchallRouteComponent,
})

function CatchallRouteComponent() {
  const { slug } = Route.useParams()

  return (
    <div className="p-4 bg-yellow-100 rounded">
      <h2 data-testid="route-type">Catch-all Route</h2>
      <p data-testid="param-value">{slug}</p>
      <p className="text-sm text-gray-600">
        This route matches any string that doesn't match UUID or Numeric
        patterns.
      </p>
    </div>
  )
}
