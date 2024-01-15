import { FileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = new FileRoute('/error').createRoute({
  component: ErrorComponent,
  loader: async () => {
    if (Math.random() > 0.5) throw new Error('Random error!')
  },
  wrapInSuspense: true,
  errorComponent: ({ error }) => {
    return (
      <div className="p-2">
        <h3>Caught: {(error as Error).message}</h3>
        <p>(This page has a 50/50 change of throwing an error)</p>
      </div>
    )
  },
})

function ErrorComponent() {
  return (
    <div className="p-2">
      <h3>
        The loader of this page will have a 50/50 change of throwing an error!
      </h3>
    </div>
  )
}
