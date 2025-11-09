import { createFileRoute } from '@tanstack/preact-router'
export const Route = createFileRoute('/_pathlessLayout/_nested-layout/route-b')(
  {
    component: LayoutBComponent,
  },
)

function LayoutBComponent() {
  return <div>I'm layout B!</div>
}
