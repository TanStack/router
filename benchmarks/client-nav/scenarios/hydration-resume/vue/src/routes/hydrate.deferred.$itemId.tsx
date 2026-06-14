import * as Vue from 'vue'
import { Suspense } from 'vue'
import { Await, createRoute } from '@tanstack/vue-router'
import {
  createDeferredHydrationMarkerAttributes,
  hydrationResumeRouteGcTime,
  hydrationResumeRouteStaleTime,
  type HydrationResumeDeferredPayload,
} from '../../../shared.ts'
import { DeferredResolved } from '../perf'
import { hydrationResumeRuntime } from '../runtime'
import { hydrateRoute } from './hydrate'

const DeferredPage = Vue.defineComponent({
  setup() {
    const loaderData = deferredRoute.useLoaderData()

    return () => (
      <>
        <div
          {...createDeferredHydrationMarkerAttributes(
            'deferred-shell',
            loaderData.value.itemId,
            loaderData.value.source,
          )}
        />
        <Suspense>
          {{
            default: () => (
              <Await
                promise={loaderData.value.deferred}
                children={(payload: HydrationResumeDeferredPayload) => (
                  <DeferredResolved
                    payload={payload}
                    source={loaderData.value.source}
                  />
                )}
              />
            ),
            fallback: () => (
              <div
                {...createDeferredHydrationMarkerAttributes(
                  'deferred-fallback',
                  loaderData.value.itemId,
                  loaderData.value.source,
                )}
              />
            ),
          }}
        </Suspense>
      </>
    )
  },
})

export const deferredRoute = createRoute({
  getParentRoute: () => hydrateRoute,
  path: 'deferred/$itemId',
  loader: ({ params }) => {
    const sequence = hydrationResumeRuntime.recordLoader('deferred')
    return hydrationResumeRuntime.createClientDeferredLoaderData(
      String(params.itemId),
      sequence,
    )
  },
  staleTime: hydrationResumeRouteStaleTime,
  gcTime: hydrationResumeRouteGcTime,
  component: DeferredPage,
})
