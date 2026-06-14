import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { MASKING_ROUTE_MARKERS, MASKING_ROUTE_PATHS } from '../../../shared.ts'
import { rootRoute } from './__root'

const PhotoModalPage = Vue.defineComponent({
  setup() {
    const params = photoModalRoute.useParams()

    return () => (
      <div
        data-route-marker={MASKING_ROUTE_MARKERS.photoModal}
        data-photo-id={params.value.photoId}
      />
    )
  },
})

export const photoModalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: MASKING_ROUTE_PATHS.photoModal,
  component: PhotoModalPage,
})
