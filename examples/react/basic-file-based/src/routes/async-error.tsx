import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/async-error')({
  component: RouteComponent,
  beforeLoad: async () => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    throw new Error('error thrown')
  },
})

function RouteComponent() {
  return <div>Hello "/async-error"!</div>
}
