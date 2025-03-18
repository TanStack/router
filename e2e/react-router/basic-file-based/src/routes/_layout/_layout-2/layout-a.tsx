import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute({
  component: LayoutAComponent,
})

function LayoutAComponent() {
  return <div>I'm layout A!</div>
}
