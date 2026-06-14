import { createRenderEffect } from 'solid-js'
import { createRoute, useBlocker } from '@tanstack/solid-router'
import { runHistoryEventsBlockersComputation } from '../../../shared.ts'
import {
  historyEventsBlockersRuntime,
  pathSeed,
  shouldBlockHistoryNavigation,
} from '../runtime'
import { historyRoute } from './history'

export const formRoute = createRoute({
  getParentRoute: () => historyRoute,
  path: 'form/$formId',
  component: FormPage,
})

function FormPage() {
  const params = formRoute.useParams()
  const resolver = useBlocker({
    shouldBlockFn: shouldBlockHistoryNavigation,
    withResolver: true,
    enableBeforeUnload: false,
  })

  createRenderEffect(() => {
    historyEventsBlockersRuntime.observeResolver(resolver())
  })

  createRenderEffect(() => {
    void runHistoryEventsBlockersComputation(pathSeed(params().formId))
  })

  return (
    <main
      data-history-events-id={params().formId}
      data-history-events-page="form"
    >
      {params().formId}
    </main>
  )
}
