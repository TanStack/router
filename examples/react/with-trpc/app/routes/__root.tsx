import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
})

function RootComponent() {
  return <Outlet />
}
