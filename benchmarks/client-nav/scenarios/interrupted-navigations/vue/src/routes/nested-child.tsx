import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { createNestedChildLoaderKey } from '../../../shared.ts'
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
          {`${data.value.kind}:${data.value.group}:${data.value.id}:${data.value.sequence}:${data.value.checksum}`}
        </main>
      )
    }
  },
})

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
