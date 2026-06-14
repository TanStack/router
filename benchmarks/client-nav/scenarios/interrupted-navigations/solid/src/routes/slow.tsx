import { createRoute } from '@tanstack/solid-router'
import { createSlowLoaderKey } from '../../../shared.ts'
import { CommitEffect, interruptedNavigationRuntime } from '../runtime'
import { interruptRoute } from './interrupt'

export const slowRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: 'slow/$id',
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'slow',
      createSlowLoaderKey(params.id),
      abortController.signal,
      { id: params.id },
    ),
  gcTime: 0,
  component: SlowPage,
})

function SlowPage() {
  const data = slowRoute.useLoaderData()

  return (
    <main data-interrupted-id={data().id} data-interrupted-page="slow">
      <CommitEffect payload={data()} />
      {`${data().kind}:${data().id}:${data().sequence}:${data().checksum}`}
    </main>
  )
}
