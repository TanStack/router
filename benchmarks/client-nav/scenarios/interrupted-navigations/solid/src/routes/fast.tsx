import { createRoute } from '@tanstack/solid-router'
import { CommitEffect, interruptedNavigationRuntime } from '../runtime'
import { interruptRoute } from './interrupt'

export const fastRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: 'fast/$id',
  loader: ({ params }) =>
    interruptedNavigationRuntime.recordFastLoad(params.id),
  staleTime: 0,
  gcTime: 0,
  component: FastPage,
})

function FastPage() {
  const data = fastRoute.useLoaderData()

  return (
    <main data-interrupted-id={data().id} data-interrupted-page="fast">
      <CommitEffect payload={data()} />
      {`${data().kind}:${data().id}:${data().sequence}:${data().checksum}`}
    </main>
  )
}
