import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { rootRoute } from './__root'

const PhotosPage = Vue.defineComponent({
  setup() {
    return () => <div data-route-marker="photos" />
  },
})

export const photosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/photos',
  component: PhotosPage,
})
