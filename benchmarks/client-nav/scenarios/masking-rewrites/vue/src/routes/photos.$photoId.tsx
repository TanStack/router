import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { rootRoute } from './__root'

const PhotoDetailPage = Vue.defineComponent({
  setup() {
    const params = photoDetailRoute.useParams()

    return () => (
      <div
        data-route-marker="photo-detail"
        data-photo-id={params.value.photoId}
      />
    )
  },
})

export const photoDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos/$photoId',
  component: PhotoDetailPage,
})
