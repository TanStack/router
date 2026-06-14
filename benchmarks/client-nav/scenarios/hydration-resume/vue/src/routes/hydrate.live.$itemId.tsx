import * as Vue from 'vue'
import { createRoute } from '@tanstack/vue-router'
import { buildLiveLoaderData } from '../../../shared.ts'
import { PerfSubscriber, subscriberSlots } from '../perf'
import { hydrationResumeRuntime } from '../runtime'
import { hydrateRoute } from './hydrate'

const LivePage = Vue.defineComponent({
  setup() {
    const params = liveRoute.useParams()
    const loaderData = liveRoute.useLoaderData()

    return () => (
      <>
        {subscriberSlots.map((slot) => (
          <PerfSubscriber
            key={`live-${slot}`}
            seed={loaderData.value.checksum + slot}
          />
        ))}
        <div
          data-hydration-resume-marker="live"
          data-item-id={params.value.itemId}
          data-source={loaderData.value.source}
          data-sequence={loaderData.value.sequence}
        />
      </>
    )
  },
})

export const liveRoute = createRoute({
  getParentRoute: () => hydrateRoute,
  path: 'live/$itemId',
  loader: ({ params }) => {
    const sequence = hydrationResumeRuntime.recordLoader('live')
    return buildLiveLoaderData(
      hydrationResumeRuntime.getActiveFixture(),
      String(params.itemId),
      sequence,
    )
  },
  staleTime: Infinity,
  gcTime: Infinity,
  component: LivePage,
})
