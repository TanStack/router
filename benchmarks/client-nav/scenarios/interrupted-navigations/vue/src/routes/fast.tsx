import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import {
  interruptedNavigationRuntime,
  recordInterruptedCommit,
} from '../runtime'
import { interruptRoute } from './interrupt'

const FastPage: ReturnType<typeof Vue.defineComponent> = Vue.defineComponent({
  setup() {
    const data = fastRoute.useLoaderData()

    return () => {
      recordInterruptedCommit(data.value)

      return (
        <main data-interrupted-id={data.value.id} data-interrupted-page="fast">
          {`${data.value.kind}:${data.value.id}:${data.value.sequence}:${data.value.checksum}`}
        </main>
      )
    }
  },
})

export const fastRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: 'fast/$id',
  loader: ({ params }) =>
    interruptedNavigationRuntime.recordFastLoad(params.id),
  staleTime: 0,
  gcTime: 0,
  component: FastPage,
})
