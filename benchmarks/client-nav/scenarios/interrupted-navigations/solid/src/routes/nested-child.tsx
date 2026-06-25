import { createRoute } from '@tanstack/solid-router'
import {
  createNestedChildLoaderKey,
  formatInterruptedNestedPayload,
  interruptedNavigationControlledRouteCacheOptions,
  interruptedNavigationRoutePaths,
} from '../../../shared.ts'
import { CommitEffect, interruptedNavigationRuntime } from '../runtime'
import { nestedParentRoute } from './nested-parent'

export const nestedChildRoute = createRoute({
  getParentRoute: () => nestedParentRoute,
  path: interruptedNavigationRoutePaths.nestedChild,
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'nestedChild',
      createNestedChildLoaderKey(params.group, params.id),
      abortController.signal,
      { id: params.id, group: params.group },
    ),
  ...interruptedNavigationControlledRouteCacheOptions,
  component: NestedPage,
})

function NestedPage() {
  const data = nestedChildRoute.useLoaderData()

  return (
    <main
      data-interrupted-group={data().group}
      data-interrupted-id={data().id}
      data-interrupted-page="nested"
    >
      <CommitEffect payload={data()} />
      {formatInterruptedNestedPayload(data())}
    </main>
  )
}
