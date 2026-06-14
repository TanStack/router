import * as Vue from 'vue'
import { createRoute, useBlocker } from '@tanstack/vue-router'
import {
  createHistoryEventsBlockerOptions,
  runHistoryEventsBlockersComputation,
} from '../../../shared.ts'
import {
  historyEventsBlockersRuntime,
  pathSeed,
  shouldBlockHistoryNavigation,
} from '../runtime'
import { historyRoute } from './history'

const FormPage = Vue.defineComponent({
  setup() {
    const params = formRoute.useParams()
    const resolver = useBlocker(
      createHistoryEventsBlockerOptions(shouldBlockHistoryNavigation),
    )

    Vue.watchEffect(() => {
      historyEventsBlockersRuntime.observeResolver(resolver.value)
    })

    return () => {
      void runHistoryEventsBlockersComputation(pathSeed(params.value.formId))

      return (
        <main
          data-history-events-id={params.value.formId}
          data-history-events-page="form"
        >
          {params.value.formId}
        </main>
      )
    }
  },
})

export const formRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: 'form/$formId',
  component: FormPage,
})
