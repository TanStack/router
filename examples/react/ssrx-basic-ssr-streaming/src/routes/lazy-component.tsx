import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

const MyHeavyComponent = lazy(() => import('~/components/heavy-component.tsx'))

export const Route = createFileRoute('/lazy-component')({
  component: LazyComponent,
  meta: () => [
    {
      title: 'Lazy Component',
    },
  ],
})

function LazyComponent() {
  return (
    <div>
      <h2>Lazy Component</h2>

      <p>
        Just a simple component that is lazy loaded. The lazy loaded chunk
        should only be loaded when this page is visited.
      </p>

      <div className="pt-5">
        <Suspense fallback={<div>Loading heavy component...</div>}>
          <MyHeavyComponent />
        </Suspense>
      </div>
    </div>
  )
}
