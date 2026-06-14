import { createRoute } from '@tanstack/react-router'
import { MASKING_ROUTE_MARKERS, MASKING_ROUTE_PATHS } from '../../../shared.ts'
import { rootRoute } from './__root'

export const photoModalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MASKING_ROUTE_PATHS.photoModal,
  component: PhotoModalPage,
})

function PhotoModalPage() {
  const params = photoModalRoute.useParams()

  return (
    <div
      data-route-marker={MASKING_ROUTE_MARKERS.photoModal}
      data-photo-id={params.photoId}
    />
  )
}
