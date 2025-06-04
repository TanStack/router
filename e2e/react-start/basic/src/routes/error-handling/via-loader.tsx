import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/error-handling/via-loader')({
  loader: async () => {
    throw new Error('Loader error in /error-handling/loader-error-handling')
  },
  component: RouteComponent,
  errorComponent: () => {
    return (
      <div data-testid="error-handling-loader-error-component">
        error component
      </div>
    )
  },
})

function RouteComponent() {
  return (
    <div data-testid="error-handling-loader-route-component">
      route component
    </div>
  )
}
