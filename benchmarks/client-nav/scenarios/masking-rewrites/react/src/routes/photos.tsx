import { createRoute } from '@tanstack/react-router'
import { MASKING_ROUTE_MARKERS, MASKING_ROUTE_PATHS } from '../../../shared.ts'
import { rootRoute } from './__root'

export const photosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MASKING_ROUTE_PATHS.photos,
  component: PhotosPage,
})

function PhotosPage() {
  return <div data-route-marker={MASKING_ROUTE_MARKERS.photos} />
}
