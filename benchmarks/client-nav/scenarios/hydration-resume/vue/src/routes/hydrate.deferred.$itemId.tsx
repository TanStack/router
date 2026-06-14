import * as Vue from 'vue'
import { Suspense } from 'vue'
import { Await, createRoute } from '@tanstack/vue-router'
import type { HydrationResumeDeferredPayload } from '../../../shared.ts'
import { DeferredResolved } from '../perf'
import { hydrationResumeRuntime } from '../runtime'
import { hydrateRoute } from './hydrate'

const DeferredPage = Vue.defineComponent({
  setup() {
    const loaderData = deferredRoute.useLoaderData()

    return () => (
      <>
        <div
          data-hydration-resume-marker="deferred-shell"
          data-item-id={loaderData.value.itemId}
          data-source={loaderData.value.source}
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
                data-hydration-resume-marker="deferred-fallback"
                data-item-id={loaderData.value.itemId}
                data-source={loaderData.value.source}
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
  staleTime: Infinity,
  gcTime: Infinity,
  component: DeferredPage,
})
