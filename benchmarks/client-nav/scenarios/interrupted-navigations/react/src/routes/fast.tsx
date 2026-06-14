import { createRoute } from '@tanstack/react-router'
import {
  formatInterruptedPagePayload,
  interruptedNavigationFastRouteCacheOptions,
  interruptedNavigationRoutePaths,
} from '../../../shared.ts'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
import { interruptRoute } from './interrupt'

export const fastRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: interruptedNavigationRoutePaths.fast,
  loader: ({ params }) =>
    interruptedNavigationRuntime.recordFastLoad(params.id),
  ...interruptedNavigationFastRouteCacheOptions,
  component: FastPage,
})

function FastPage() {
  const data = fastRoute.useLoaderData()
  recordInterruptedCommit(data)

  return (
    <main data-interrupted-id={data.id} data-interrupted-page="fast">
      {formatInterruptedPagePayload(data)}
    </main>
  )
}
