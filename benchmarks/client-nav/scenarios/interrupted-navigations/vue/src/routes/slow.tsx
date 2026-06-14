import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { createSlowLoaderKey } from '../../../shared.ts'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
import { interruptRoute } from './interrupt'

const SlowPage: ReturnType<typeof Vue.defineComponent> = Vue.defineComponent({
  setup() {
    const data = slowRoute.useLoaderData()

    return () => {
      recordInterruptedCommit(data.value)

      return (
        <main data-interrupted-id={data.value.id} data-interrupted-page="slow">
          {`${data.value.kind}:${data.value.id}:${data.value.sequence}:${data.value.checksum}`}
        </main>
      )
    }
  },
})

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
