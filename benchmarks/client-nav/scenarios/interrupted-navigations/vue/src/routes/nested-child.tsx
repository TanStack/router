import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import {
  createNestedChildLoaderKey,
  formatInterruptedNestedPayload,
  interruptedNavigationControlledRouteCacheOptions,
  interruptedNavigationRoutePaths,
} from '../../../shared.ts'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
import { nestedParentRoute } from './nested-parent'

const NestedPage: ReturnType<typeof Vue.defineComponent> = Vue.defineComponent({
  setup() {
    const data = nestedChildRoute.useLoaderData()

    return () => {
      recordInterruptedCommit(data.value)

      return (
        <main
          data-interrupted-group={data.value.group}
          data-interrupted-id={data.value.id}
          data-interrupted-page="nested"
        >
          {formatInterruptedNestedPayload(data.value)}
        </main>
      )
    }
  },
})

export const nestedChildRoute = createRoute({
  getParentRoute: () => nestedParentRoute,
  path: interruptedNavigationRoutePaths.nestedChild,
  loader: ({ params, abortController }) =>
    interruptedNavigationRuntime.createControlledLoad(
      'nestedChild',
      createNestedChildLoaderKey(params.group, params.id),
      abortController.signal,
      { id: params.id, group: params.group },
    ),
  ...interruptedNavigationControlledRouteCacheOptions,
  component: NestedPage,
})
