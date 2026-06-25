import { createRoute } from '@tanstack/react-router'
import {
  createSlowLoaderKey,
  formatInterruptedPagePayload,
  interruptedNavigationControlledRouteCacheOptions,
  interruptedNavigationRoutePaths,
} from '../../../shared.ts'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
import { interruptRoute } from './interrupt'

export const slowRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: interruptedNavigationRoutePaths.slow,
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'slow',
      createSlowLoaderKey(params.id),
      abortController.signal,
      { id: params.id },
    ),
  ...interruptedNavigationControlledRouteCacheOptions,
  component: SlowPage,
})

function SlowPage() {
  const data = slowRoute.useLoaderData()
  recordInterruptedCommit(data)

  return (
    <main data-interrupted-id={data.id} data-interrupted-page="slow">
      {formatInterruptedPagePayload(data)}
    </main>
  )
}
