import { Outlet, createRootRoute } from '@tanstack/react-router'
import { RootNotFoundComponent } from '../route-components'

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: RootNotFoundComponent,
})

function RootComponent() {
  return <Outlet />
}
