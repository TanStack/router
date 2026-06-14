import { Outlet, createRoute } from '@tanstack/react-router'
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
      {subscriberSlots.map((slot) => (
        <PerfSubscriber
          key={`hydrate-${slot}`}
          seed={loaderData.checksum + slot}
        />
      ))}
      <div {...createHydrateSectionAttributes(loaderData)} />
      <Outlet />
    </>
  )
}
