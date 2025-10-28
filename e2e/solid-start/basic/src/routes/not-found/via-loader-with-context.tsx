import { createFileRoute, notFound, useRouteContext } from '@tanstack/solid-router'

export const Route = createFileRoute('/not-found/via-loader-with-context')({
  beforeLoad: () => {
    return {
        fool: 'of a Took'
    }
  },
  loader: () => {
    throw notFound()
  },
  component: RouteComponent,
  notFoundComponent: () => {
    const context = useRouteContext({ strict: false })
    return (
        <div data-testid="via-loader-with-context-notFound-component" data-server={typeof window}>
        {`Hello you fool ${context().fool}`}
        </div>
    )
  },
})

function RouteComponent() {
  return (
    <div data-testid="via-loader-with-context-route-component" data-server={typeof window}>
      Hello "/not-found/via-loader-with-context"!
    </div>
  )
}
