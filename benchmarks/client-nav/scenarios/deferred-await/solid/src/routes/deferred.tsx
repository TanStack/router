import { createRoute } from '@tanstack/solid-router'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/deferred',
  component: DeferredIndex,
})

function DeferredIndex() {
  return <main data-deferred-page="index" />
}
