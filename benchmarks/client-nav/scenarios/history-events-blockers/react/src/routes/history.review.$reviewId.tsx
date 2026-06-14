import { createRoute } from '@tanstack/react-router'
import { runHistoryEventsBlockersComputation } from '../../../shared.ts'
import { pathSeed } from '../runtime'
import { historyRoute } from './history'

export const reviewRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: 'review/$reviewId',
  component: ReviewPage,
})

function ReviewPage() {
  const params = reviewRoute.useParams()
  void runHistoryEventsBlockersComputation(pathSeed(params.reviewId))

  return (
    <main
      data-history-events-id={params.reviewId}
      data-history-events-page="review"
    >
      {params.reviewId}
    </main>
  )
}
