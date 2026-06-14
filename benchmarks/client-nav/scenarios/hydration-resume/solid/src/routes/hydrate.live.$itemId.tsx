import { For } from 'solid-js'
import { createRoute } from '@tanstack/solid-router'
import {
  buildLiveLoaderData,
  createLiveHydrationMarkerAttributes,
  hydrationResumeRouteGcTime,
  hydrationResumeRouteStaleTime,
} from '../../../shared.ts'
import { PerfSubscriber, subscriberSlots } from '../perf'
import { hydrationResumeRuntime } from '../runtime'
import { hydrateRoute } from './hydrate'

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
  staleTime: hydrationResumeRouteStaleTime,
  gcTime: hydrationResumeRouteGcTime,
  component: LivePage,
})

function LivePage() {
  const params = liveRoute.useParams()
  const loaderData = liveRoute.useLoaderData()

  return (
    <>
      <For each={subscriberSlots}>
        {(slot) => <PerfSubscriber seed={loaderData().checksum + slot} />}
      </For>
      <div
        {...createLiveHydrationMarkerAttributes(params().itemId, loaderData())}
      />
    </>
  )
}
