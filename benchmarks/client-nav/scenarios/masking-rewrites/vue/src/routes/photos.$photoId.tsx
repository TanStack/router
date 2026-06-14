import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { MASKING_ROUTE_MARKERS, MASKING_ROUTE_PATHS } from '../../../shared.ts'
import { rootRoute } from './__root'

const PhotoDetailPage = Vue.defineComponent({
  setup() {
    const params = photoDetailRoute.useParams()

    return () => (
      <div
        data-route-marker={MASKING_ROUTE_MARKERS.photoDetail}
        data-photo-id={params.value.photoId}
      />
    )
  },
})

export const photoDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MASKING_ROUTE_PATHS.photoDetail,
  component: PhotoDetailPage,
})
