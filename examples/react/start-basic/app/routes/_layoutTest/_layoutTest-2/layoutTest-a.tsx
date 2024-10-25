import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_layoutTest/_layoutTest-2/layoutTest-a')(
  {
    component: LayoutAComponent,
  },
)

function LayoutAComponent() {
  return <div>I'm layout A!</div>
}
