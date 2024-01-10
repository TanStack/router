import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'

export const Route = new FileRoute('/_layout/layout-b').createRoute({
  component: LayoutBComponent,
})

function LayoutBComponent() {
  return <div>I'm B!</div>
}
