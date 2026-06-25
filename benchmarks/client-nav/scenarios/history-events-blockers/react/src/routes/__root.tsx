import { Outlet, createRootRoute } from '@tanstack/react-router'

export const rootRoute = createRootRoute({
  component: Root,
})

function Root() {
  return <Outlet />
}
