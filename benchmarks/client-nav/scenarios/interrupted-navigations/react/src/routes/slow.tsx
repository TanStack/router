import { createRoute } from '@tanstack/react-router'
import { createSlowLoaderKey } from '../../../shared.ts'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
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
  recordInterruptedCommit(data)

  return (
    <main data-interrupted-id={data.id} data-interrupted-page="slow">
      {`${data.kind}:${data.id}:${data.sequence}:${data.checksum}`}
    </main>
  )
}
