import { createRoute } from '@tanstack/solid-router'
import {
  historyEventsBlockersDonePath,
  runHistoryEventsBlockersComputation,
} from '../../../shared.ts'
import { pathSeed } from '../runtime'
import { historyRoute } from './history'

export const doneRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: 'done',
  component: DonePage,
})

function DonePage() {
  void runHistoryEventsBlockersComputation(
    pathSeed(historyEventsBlockersDonePath),
  )

  return <main data-history-events-page="done" />
}
