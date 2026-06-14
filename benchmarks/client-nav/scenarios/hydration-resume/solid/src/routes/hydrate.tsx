import { For } from 'solid-js'
import { Outlet, createRoute } from '@tanstack/solid-router'
import {
  buildHydrateLoaderData,
  createHydrateSectionAttributes,
  hydrationResumeRouteGcTime,
  hydrationResumeRouteStaleTime,
} from '../../../shared.ts'
import { PerfSubscriber, subscriberSlots } from '../perf'
import { hydrationResumeRuntime } from '../runtime'
import { rootRoute } from './__root'

export const hydrateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hydrate',
  loader: () => {
    const sequence = hydrationResumeRuntime.recordLoader('hydrate')
    return buildHydrateLoaderData(
      hydrationResumeRuntime.getActiveFixture(),
      'client',
      sequence,
    )
  },
  staleTime: hydrationResumeRouteStaleTime,
  gcTime: hydrationResumeRouteGcTime,
  component: HydrateLayout,
})

function HydrateLayout() {
  const loaderData = hydrateRoute.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>
        {(slot) => <PerfSubscriber seed={loaderData().checksum + slot} />}
      </For>
      <div {...createHydrateSectionAttributes(loaderData())} />
      <Outlet />
    </>
  )
}
