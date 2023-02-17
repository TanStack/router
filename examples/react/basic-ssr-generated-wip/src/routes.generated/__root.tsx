import { lazy } from '@tanstack/router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import * as React from 'react'
import { Link, Outlet, RootRoute } from '@tanstack/router'
import { RouterContext } from '../router'
export const rootRoute = RootRoute.withRouterContext<RouterContext>()({
  component: Root,
})
function Root() {
  return (
    <>
      <div className="p-2 flex gap-2 text-lg">
        <Link
          to="/"
          activeProps={{
            className: 'font-bold',
          }}
          activeOptions={{
            exact: true,
          }}
        >
          Home
        </Link>{' '}
        <Link
          to="/posts"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Posts
        </Link>
      </div>
      <hr />
      <Outlet /> {/* Start rendering router matches */}
      <TanStackRouterDevtools position="bottom-right" />
      <script type="module" src="/src/entry-client.tsx"></script>
    </>
  )
}
export { route }
