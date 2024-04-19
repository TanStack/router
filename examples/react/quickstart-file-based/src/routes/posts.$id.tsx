// REMOVE & REGENERATE THE ROUTE_TREE BEFORE MERGE
import * as React from 'react'
import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$id')({
  component: Comp,
})

function Comp() {
  const navigate = useNavigate()
  return (
    <>
      <div>Hello /posts/$id!</div>
      <div className="flex gap-2">
        <Link from="/posts/$id" to="/posts/$id/summary">
          Summary
        </Link>
        <Link from="/posts/$id" to="/posts/$id/notes">
          Notes
        </Link>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            navigate({ from: '/posts/$id', to: '/posts/$id/summary' })
          }
        >
          Go to summary
        </button>
        <button
          onClick={() =>
            navigate({ from: '/posts/$id', to: '/posts/$id/notes' })
          }
        >
          Go to notes
        </button>
      </div>
      <hr />
      <Outlet />
    </>
  )
}
