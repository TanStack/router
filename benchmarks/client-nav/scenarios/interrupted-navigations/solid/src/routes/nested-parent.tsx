import { Outlet, createRoute } from '@tanstack/solid-router'
import {
  createNestedParentLoaderKey,
  interruptedNavigationControlledRouteCacheOptions,
  interruptedNavigationRoutePaths,
} from '../../../shared.ts'
import { CommitEffect, interruptedNavigationRuntime } from '../runtime'
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

  return (
    <>
      <CommitEffect payload={data()} />
      <Outlet />
    </>
  )
}
