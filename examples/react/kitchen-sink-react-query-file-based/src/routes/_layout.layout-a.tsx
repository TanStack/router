import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

export const Route = new FileRoute("/_layout/layout-a").createRoute({
  component: LayoutAComponent,
})

function LayoutAComponent() {
  return <div>I'm A!</div>
}
