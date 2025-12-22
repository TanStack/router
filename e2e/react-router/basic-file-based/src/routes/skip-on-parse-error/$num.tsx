import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/skip-on-parse-error/$num')({
  params: {
    parse: (params) => {
      const num = parseInt(params.num, 10)
      if (isNaN(num) || num.toString() !== params.num) {
        throw new Error('Invalid numeric format')
      }
      return { num }
    },
    stringify: (params) => ({ num: String(params.num) }),
  },
  skipRouteOnParseError: true,
  component: NumericRouteComponent,
})

function NumericRouteComponent() {
  const { num } = Route.useParams()

  return (
    <div className="p-4 bg-green-100 rounded">
      <h2 data-testid="route-type">Numeric Route</h2>
      <p data-testid="param-value">{num}</p>
      <p data-testid="param-type">Type: {typeof num}</p>
      <p className="text-sm text-gray-600">
        This route matched because the param is a valid number.
      </p>
    </div>
  )
}
