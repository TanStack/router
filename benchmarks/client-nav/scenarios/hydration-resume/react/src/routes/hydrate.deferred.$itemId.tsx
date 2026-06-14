import { Suspense } from 'react'
import { Await, createRoute } from '@tanstack/react-router'
import {
  createDeferredHydrationMarkerAttributes,
  hydrationResumeRouteGcTime,
  hydrationResumeRouteStaleTime,
  type HydrationResumeDeferredPayload,
} from '../../../shared.ts'
import { DeferredResolved } from '../perf'
import { hydrationResumeRuntime } from '../runtime'
import { hydrateRoute } from './hydrate'

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

function DeferredPage() {
  const loaderData = deferredRoute.useLoaderData()

  return (
    <>
      <div
        {...createDeferredHydrationMarkerAttributes(
          'deferred-shell',
          loaderData.itemId,
          loaderData.source,
        )}
      />
      <Suspense
        fallback={
          <div
            {...createDeferredHydrationMarkerAttributes(
              'deferred-fallback',
              loaderData.itemId,
              loaderData.source,
            )}
          />
        }
      >
        <Await promise={loaderData.deferred}>
          {(payload) => (
            <DeferredResolved
              payload={payload as HydrationResumeDeferredPayload}
              source={loaderData.source}
            />
          )}
        </Await>
      </Suspense>
    </>
  )
}
