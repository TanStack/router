import { createFileRoute } from '@tanstack/react-router'

// Records whether the component ever rendered without the context value from
// the parent route's beforeLoad (https://github.com/TanStack/router/issues/7602)
let sawUndefinedContext = false

export const Route = createFileRoute('/context-propagation/')({
  // ensure the loader runs again on back navigation despite defaultStaleTime
  staleTime: 0,
  loader: () => new Promise((resolve) => setTimeout(resolve, 100)),
  component: RouteComponent,
})

function RouteComponent() {
  const { number } = Route.useRouteContext()
  sawUndefinedContext ||= number === undefined

  return (
    <p data-testid="context-propagation-result">
      number = {String(number)}, saw undefined = {String(sawUndefinedContext)}
    </p>
  )
}
