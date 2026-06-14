import { Outlet, createRootRoute } from '@tanstack/solid-router'

export function createRootRouteForPreloading() {
  return createRootRoute({
    component: RootComponent,
  })
}

function RootComponent() {
  return <Outlet />
}
