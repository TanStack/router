import { Suspense } from 'solid-js'
import { Await, createRoute } from '@tanstack/solid-router'
import type { HydrationResumeDeferredPayload } from '../../../shared.ts'
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
  staleTime: Infinity,
  gcTime: Infinity,
  component: DeferredPage,
})

function DeferredPage() {
  const loaderData = deferredRoute.useLoaderData()

  return (
    <>
      <div
        data-hydration-resume-marker="deferred-shell"
        data-item-id={loaderData().itemId}
        data-source={loaderData().source}
      />
      <Suspense
        fallback={
          <div
            data-hydration-resume-marker="deferred-fallback"
            data-item-id={loaderData().itemId}
            data-source={loaderData().source}
          />
        }
      >
        <Await promise={loaderData().deferred}>
          {(payload) => (
            <DeferredResolved
              payload={payload as HydrationResumeDeferredPayload}
              source={loaderData().source}
            />
          )}
        </Await>
      </Suspense>
    </>
  )
}
