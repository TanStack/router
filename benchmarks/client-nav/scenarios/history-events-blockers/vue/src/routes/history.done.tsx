import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import {
  historyEventsBlockersDonePath,
  runHistoryEventsBlockersComputation,
} from '../../../shared.ts'
import { pathSeed } from '../runtime'
import { historyRoute } from './history'

const DonePage = Vue.defineComponent({
  setup() {
    return () => {
      void runHistoryEventsBlockersComputation(
        pathSeed(historyEventsBlockersDonePath),
      )

      return <main data-history-events-page="done" />
    }
  },
})

export const doneRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: 'done',
  component: DonePage,
})
