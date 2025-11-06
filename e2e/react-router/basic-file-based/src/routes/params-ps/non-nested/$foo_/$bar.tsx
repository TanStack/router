import { createFileRoute, useParams } from '@tanstack/react-router'
import { useExperimentalNonNestedRoutes } from '../../../../../tests/utils/useExperimentalNonNestedRoutes'

export const Route = createFileRoute('/params-ps/non-nested/$foo_/$bar')({
  component: RouteComponent,
})

function RouteComponent() {
  const fooParams = useParams({
    // @ts-expect-error path is updated with new Experimental Non Nested Paths to not include the trailing underscore
    from: `/params-ps/non-nested/${useExperimentalNonNestedRoutes ? '$foo' : '$foo_'}`,
  })
  const routeParams = Route.useParams()

  return (
    <div>
      <div data-testid="foo-params-value">{JSON.stringify(fooParams)}</div>
      <div data-testid="foo-bar-params-value">
        {JSON.stringify(routeParams)}
      </div>
    </div>
  )
}
