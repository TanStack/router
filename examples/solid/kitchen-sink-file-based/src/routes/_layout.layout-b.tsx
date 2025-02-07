import * as React from 'solid-js'
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/_layout/layout-b')({
  component: LayoutBComponent,
})

function LayoutBComponent() {
  return <div>I'm B!</div>
}
