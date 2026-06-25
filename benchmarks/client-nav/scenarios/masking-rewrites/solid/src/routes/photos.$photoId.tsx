import { createRoute } from '@tanstack/solid-router'
import { MASKING_ROUTE_MARKERS, MASKING_ROUTE_PATHS } from '../../../shared.ts'
import { rootRoute } from './__root'

export const photoDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MASKING_ROUTE_PATHS.photoDetail,
  component: PhotoDetailPage,
})

function PhotoDetailPage() {
  const params = photoDetailRoute.useParams()

  return (
    <div
      data-route-marker={MASKING_ROUTE_MARKERS.photoDetail}
      data-photo-id={params().photoId}
    />
  )
}
