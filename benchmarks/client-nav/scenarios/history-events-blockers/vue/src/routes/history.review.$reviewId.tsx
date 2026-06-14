import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { runHistoryEventsBlockersComputation } from '../../../shared.ts'
import { pathSeed } from '../runtime'
import { historyRoute } from './history'

const ReviewPage = Vue.defineComponent({
  setup() {
    const params = reviewRoute.useParams()

    return () => {
      void runHistoryEventsBlockersComputation(pathSeed(params.value.reviewId))

      return (
        <main
          data-history-events-id={params.value.reviewId}
          data-history-events-page="review"
        >
          {params.value.reviewId}
        </main>
      )
    }
  },
})

export const reviewRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: 'review/$reviewId',
  component: ReviewPage,
})
