import { createRoute } from '@tanstack/solid-router'
import {
  formatInterruptedPagePayload,
  interruptedNavigationFastRouteCacheOptions,
  interruptedNavigationRoutePaths,
} from '../../../shared.ts'
import { CommitEffect, interruptedNavigationRuntime } from '../runtime'
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

  return (
    <main data-interrupted-id={data().id} data-interrupted-page="fast">
      <CommitEffect payload={data()} />
      {formatInterruptedPagePayload(data())}
    </main>
  )
}
