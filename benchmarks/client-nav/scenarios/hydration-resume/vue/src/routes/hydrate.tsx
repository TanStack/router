import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import { buildHydrateLoaderData } from '../../../shared.ts'
import { PerfSubscriber, subscriberSlots } from '../perf'
import { hydrationResumeRuntime } from '../runtime'
import { rootRoute } from './__root'

const HydrateLayout = Vue.defineComponent({
  setup() {
    const loaderData = hydrateRoute.useLoaderData()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <PerfSubscriber
            key={`hydrate-${slot}`}
            seed={loaderData.value.checksum + slot}
          />
        ))}
        <div
          data-hydration-resume-section="hydrate"
          data-fixture-id={loaderData.value.fixtureId}
          data-source={loaderData.value.source}
        />
        <Outlet />
      </>
    )
  },
})

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
