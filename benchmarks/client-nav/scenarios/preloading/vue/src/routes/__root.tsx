import { Outlet, createRootRoute } from '@tanstack/vue-router'

export function createRootRouteForPreloading() {
  return createRootRoute({
    component: RootComponent,
  })
}

function RootComponent() {
  return <Outlet />
}
