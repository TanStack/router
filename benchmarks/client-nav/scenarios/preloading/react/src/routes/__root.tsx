import { Outlet, createRootRoute } from '@tanstack/react-router'

export function createRootRouteForPreloading() {
  return createRootRoute({
    component: RootComponent,
  })
}

function RootComponent() {
  return <Outlet />
}
