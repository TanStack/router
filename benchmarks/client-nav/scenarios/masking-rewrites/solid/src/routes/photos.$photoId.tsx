import { createRoute } from '@tanstack/solid-router'
import { rootRoute } from './__root'

export const photoDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos/$photoId',
  component: PhotoDetailPage,
})

function PhotoDetailPage() {
  const params = photoDetailRoute.useParams()

  return (
    <div data-route-marker="photo-detail" data-photo-id={params().photoId} />
  )
}
