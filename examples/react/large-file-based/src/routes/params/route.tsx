import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createFileRoute('/params')({
  component: () => <div>Hello /params!</div>,
  head: ({ matches }) => {
    if (matches[0].routeId) {
      // ...
    }
    return {}
  },
})
