import { Outlet, createRoute } from '@tanstack/react-router'
import { createNestedParentLoaderKey } from '../../../shared.ts'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
import { interruptRoute } from './interrupt'

export const nestedParentRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: 'nested/$group',
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'nestedParent',
      createNestedParentLoaderKey(params.group),
      abortController.signal,
      { id: params.group, group: params.group },
    ),
  gcTime: 0,
  component: NestedLayout,
})

function NestedLayout() {
  const data = nestedParentRoute.useLoaderData()
  recordInterruptedCommit(data)

  return <Outlet />
}
