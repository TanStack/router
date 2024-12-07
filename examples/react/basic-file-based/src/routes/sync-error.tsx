import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sync-error')({
  component: RouteComponent,
  beforeLoad: () => {
    throw new Error('error thrown')
  },
})

function RouteComponent() {
  return <div>Hello "/sync-error"!</div>
}
