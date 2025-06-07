export const Route = createFileRoute({
  component: RouteComponent,
  beforeLoad: async () => {
    throw new Error('before load error')
  },
  errorComponent: () => {
    return (
      <div data-testid="error-handling-before-load-error-component">
        error component
      </div>
    )
  },
})

function RouteComponent() {
  return (
    <div data-testid="error-handling-before-load-route-component">
      route component
    </div>
  )
}
