import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import { createNestedParentLoaderKey } from '../../../shared.ts'
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
