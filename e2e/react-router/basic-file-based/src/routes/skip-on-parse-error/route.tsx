import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/skip-on-parse-error')({
  component: SkipOnParseErrorLayout,
})

function SkipOnParseErrorLayout() {
  return (
    <div className="p-4">
      <h1 data-testid="skip-on-parse-error-heading">
        Skip Route on Parse Error Tests (File-Based)
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        This tests the skipRouteOnParseError feature with multiple competing
        routes that have different param validators.
      </p>
      <Outlet />
    </div>
  )
}
