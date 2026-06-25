import { createRoute } from '@tanstack/solid-router'
import {
  createSlowLoaderKey,
  formatInterruptedPagePayload,
  interruptedNavigationControlledRouteCacheOptions,
  interruptedNavigationRoutePaths,
} from '../../../shared.ts'
import { CommitEffect, interruptedNavigationRuntime } from '../runtime'
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

  return (
    <main data-interrupted-id={data().id} data-interrupted-page="slow">
      <CommitEffect payload={data()} />
      {formatInterruptedPagePayload(data())}
    </main>
  )
}
