import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'

export const photosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos',
  component: PhotosPage,
})

function PhotosPage() {
  return <div data-route-marker="photos" />
}
