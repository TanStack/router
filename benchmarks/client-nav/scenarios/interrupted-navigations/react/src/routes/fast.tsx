import { createRoute } from '@tanstack/react-router'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
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
  recordInterruptedCommit(data)

  return (
    <main data-interrupted-id={data.id} data-interrupted-page="fast">
      {`${data.kind}:${data.id}:${data.sequence}:${data.checksum}`}
    </main>
  )
}
