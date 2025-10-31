import { createFileRoute, getRouteApi, useParams } from '@tanstack/react-router'
import { useExperimentalNonNestedRoutes } from '../../tests/utils/useExperimentalNonNestedRoutes'

export const Route = createFileRoute('/posts_/$postId/edit')({
  component: PostEditPage,
})

const api = getRouteApi(
  // @ts-expect-error path is updated with new Experimental Non Nested Paths to not include the trailing underscore
  `/${useExperimentalNonNestedRoutes ? 'posts' : 'posts_'}/$postId/edit`,
)

function PostEditPage() {
  const paramsViaApi = api.useParams()
  const paramsViaHook = useParams({
    // @ts-expect-error path is updated with new Experimental Non Nested Paths to not include the trailing underscore
    from: `/${useExperimentalNonNestedRoutes ? 'posts' : 'posts_'}/$postId/edit`,
  })

  const paramsViaRouteHook = Route.useParams()

  return (
    <>
      <div data-testid="params-via-hook">{paramsViaHook.postId}</div>
      <div data-testid="params-via-route-hook">{paramsViaRouteHook.postId}</div>
      <div data-testid="params-via-route-api">{paramsViaApi.postId}</div>
    </>
  )
}
