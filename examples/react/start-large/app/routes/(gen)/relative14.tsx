import * as React from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/(gen)/relative14')({
  component: RelativeComponent,
})

function RelativeComponent() {
  return (
    <div className="p-2 space-y-2">
      <Link
        from={Route.fullPath}
        to="../relative14"
        className="block py-1 text-blue-800 hover:text-blue-600"
      >
        Relative
      </Link>
    </div>
  )
}
