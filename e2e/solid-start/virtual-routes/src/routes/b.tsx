import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute(
  '/_first/_second-layout/route-without-file/layout-b',
)({
  component: LayoutBComponent,
})

function LayoutBComponent() {
  return <div>I'm layout B!</div>
}
