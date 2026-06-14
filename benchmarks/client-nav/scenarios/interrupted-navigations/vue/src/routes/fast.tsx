import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import {
  formatInterruptedPagePayload,
  interruptedNavigationFastRouteCacheOptions,
  interruptedNavigationRoutePaths,
} from '../../../shared.ts'
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
          {formatInterruptedPagePayload(data.value)}
        </main>
      )
    }
  },
})

export const fastRoute = createRoute({
  getParentRoute: () => interruptRoute,
  path: interruptedNavigationRoutePaths.fast,
  loader: ({ params }) =>
    interruptedNavigationRuntime.recordFastLoad(params.id),
  ...interruptedNavigationFastRouteCacheOptions,
  component: FastPage,
})
