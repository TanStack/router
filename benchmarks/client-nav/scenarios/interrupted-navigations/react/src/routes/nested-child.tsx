import { createRoute } from '@tanstack/react-router'
import { createNestedChildLoaderKey } from '../../../shared.ts'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
import { nestedParentRoute } from './nested-parent'

export const nestedChildRoute = createRoute({
  getParentRoute: () => nestedParentRoute,
  path: '$id',
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'nestedChild',
      createNestedChildLoaderKey(params.group, params.id),
      abortController.signal,
      { id: params.id, group: params.group },
    ),
  gcTime: 0,
  component: NestedPage,
})

function NestedPage() {
  const data = nestedChildRoute.useLoaderData()
  recordInterruptedCommit(data)

  return (
    <main
      data-interrupted-group={data.group}
      data-interrupted-id={data.id}
      data-interrupted-page="nested"
    >
      {`${data.kind}:${data.group}:${data.id}:${data.sequence}:${data.checksum}`}
    </main>
  )
}
