import { createFileRoute, useHydrated } from '@tanstack/react-router'
import { Suspense, lazy } from 'react'

const LazySsrPanel = lazy(() => import('../components/LazySsrPanel'))

export const Route = createFileRoute('/lazy-ssr')({
  component: LazySsr,
})

function LazySsr() {
  return (
    <div>
      {/* Kept outside the Suspense boundary's parent re-render path so that
          hydration state changes don't force the boundary to client-render. */}
      <HydrationMarker />
      <Suspense fallback={null}>
        <LazySsrPanel />
      </Suspense>
    </div>
  )
}

function HydrationMarker() {
  const hydrated = useHydrated()
  return (
    <div data-testid="lazy-ssr-hydrated" data-hydrated={String(hydrated)} />
  )
}
