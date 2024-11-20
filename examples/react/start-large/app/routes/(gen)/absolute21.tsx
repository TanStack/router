import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(gen)/absolute21')({
  component: AbsoluteComponent,
})

function AbsoluteComponent() {
  return (
    <div className="p-2 space-y-2">
      <Link
        to="/absolute21"
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        Absolute
      </Link>
    </div>
  )
}
