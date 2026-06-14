import { Outlet, createRootRoute } from '@tanstack/vue-router'
import { RootNotFoundComponent } from '../route-components'

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: RootNotFoundComponent,
})

function RootComponent() {
  return <Outlet />
}
