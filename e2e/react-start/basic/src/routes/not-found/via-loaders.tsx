import { createFileRoute, notFound, useRouteContext } from '@tanstack/react-router'

export const Route = createFileRoute('/not-found/via-loaders')({
  beforeLoad: () => {
    return {
        fool: 'of a Took'
    }
  },
  loader: () => {
    throw notFound()
  },
  head: () => {
    throw notFound()
  },
  component: RouteComponent,
  notFoundComponent: () => {
    const context = useRouteContext({ strict: false })
    return (
        <div data-testid="via-head-route-component" data-server={typeof window}>
        {`Hello you fool ${context.fool}`}
        </div>
    )
  },
})

function RouteComponent() {
  return (
    <div data-testid="via-head-route-component" data-server={typeof window}>
      Hello "/not-found/via-loaders"!
    </div>
  )
}
