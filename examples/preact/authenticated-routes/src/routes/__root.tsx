import { Outlet, createRootRouteWithContext } from '@tanstack/preact-router'
import { TanStackRouterDevtools } from '@tanstack/preact-router-devtools'

import type { AuthContext } from '../auth'

interface MyRouterContext {
  auth: AuthContext
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" initialIsOpen={false} />
    </>
  ),
})
