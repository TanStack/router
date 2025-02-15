import * as Solid from 'solid-js'
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/_layout/layout-a')({
  component: LayoutAComponent,
})

function LayoutAComponent() {
  return <div>I'm A!</div>
}
