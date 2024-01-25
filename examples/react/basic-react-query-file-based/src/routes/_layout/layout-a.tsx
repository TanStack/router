import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout/layout-a')({
  component: LayoutAComponent,
})

function LayoutAComponent() {
  return <div>I'm A!</div>
}
