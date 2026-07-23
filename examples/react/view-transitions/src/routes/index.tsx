import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { slideByDirection } from '../directionAwareTransition'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div className="p-2 [view-transition-name:main-content]">
      <h3>Welcome To The View Transitions Example!</h3>
      <div className="flex justify-center mt-4">
        <Link
          to={'/how-it-works'}
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
