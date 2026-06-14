import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'

export const photoModalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos/$photoId/modal',
  component: PhotoModalPage,
})

function PhotoModalPage() {
  const params = photoModalRoute.useParams()

  return <div data-route-marker="photo-modal" data-photo-id={params.photoId} />
}
