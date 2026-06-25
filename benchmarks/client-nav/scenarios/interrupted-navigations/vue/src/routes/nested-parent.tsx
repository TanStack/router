import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
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

const NestedLayout: ReturnType<typeof Vue.defineComponent> =
  Vue.defineComponent({
    setup() {
      const data = nestedParentRoute.useLoaderData()

      return () => {
        recordInterruptedCommit(data.value)
        return <Outlet />
      }
    },
  })

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
