import { createFileRoute } from '@tanstack/react-router'

// UUID validation regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/skip-on-parse-error/$uuid')({
  params: {
    parse: (params) => {
      if (!UUID_REGEX.test(params.uuid)) {
        throw new Error('Invalid UUID format')
      }
      return { uuid: params.uuid }
    },
    stringify: (params) => ({ uuid: params.uuid }),
  },
  skipRouteOnParseError: true,
  component: UuidRouteComponent,
})

function UuidRouteComponent() {
  const { uuid } = Route.useParams()

  return (
    <div className="p-4 bg-blue-100 rounded">
      <h2 data-testid="route-type">UUID Route</h2>
      <p data-testid="param-value">{uuid}</p>
      <p className="text-sm text-gray-600">
        This route matched because the param is a valid UUID.
      </p>
    </div>
  )
}
