import { Link, createFileRoute } from '@tanstack/react-router'
import { slideByDirection } from '../directionAwareTransition'

export const Route = createFileRoute('/how-it-works')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="p-2 [view-transition-name:main-content]">
      <h3>This example demonstrates a variety of custom page transitions.</h3>
      <div className="flex justify-center gap-10 mt-4">
        <Link
          to={'/'}
          // direction-aware: slides right going back, left on browser Forward
          viewTransition={slideByDirection}
          className="font-bold"
        >
          &lt;- Previous Page
        </Link>
        <Link
          to={'/explore'}
          // direction-aware: slides left going forward, right on browser Back
          viewTransition={slideByDirection}
          className="font-bold"
        >
          Next Page -&gt;
        </Link>
      </div>
    </div>
  )
}
