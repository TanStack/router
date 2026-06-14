import { Outlet, createRoute } from '@tanstack/react-router'
import {
  createNestedParentLoaderKey,
  interruptedNavigationControlledRouteCacheOptions,
  interruptedNavigationRoutePaths,
} from '../../../shared.ts'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
import { interruptRoute } from './interrupt'

export const nestedParentRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: interruptedNavigationRoutePaths.nestedParent,
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'nestedParent',
      createNestedParentLoaderKey(params.group),
      abortController.signal,
      { id: params.group, group: params.group },
    ),
  ...interruptedNavigationControlledRouteCacheOptions,
  component: NestedLayout,
})

function NestedLayout() {
  const data = nestedParentRoute.useLoaderData()
  recordInterruptedCommit(data)

  return <Outlet />
}
