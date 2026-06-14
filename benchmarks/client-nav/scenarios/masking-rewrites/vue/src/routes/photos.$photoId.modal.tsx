import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { rootRoute } from './__root'

const PhotoModalPage = Vue.defineComponent({
  setup() {
    const params = photoModalRoute.useParams()

    return () => (
      <div
        data-route-marker="photo-modal"
        data-photo-id={params.value.photoId}
      />
    )
  },
})

export const photoModalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos/$photoId/modal',
  component: PhotoModalPage,
})
