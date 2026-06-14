import { Outlet, createRoute } from '@tanstack/react-router'
import { buildHydrateLoaderData } from '../../../shared.ts'
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
  staleTime: Infinity,
  gcTime: Infinity,
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
      <div
        data-hydration-resume-section="hydrate"
        data-fixture-id={loaderData.fixtureId}
        data-source={loaderData.source}
      />
      <Outlet />
    </>
  )
}
