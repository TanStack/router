import { Outlet, createRootRoute } from '@tanstack/solid-router'

export const rootRoute = createRootRoute({
  component: Root,
})

function Root() {
  return <Outlet />
}
