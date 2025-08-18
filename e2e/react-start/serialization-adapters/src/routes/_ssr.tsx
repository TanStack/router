import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_ssr')({
  component: RouteComponent,
  ssr: true,
})

function RouteComponent() {
  return <div>Hello "/_ssr"!</div>
}
