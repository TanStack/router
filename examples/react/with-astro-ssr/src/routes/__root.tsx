import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Link, Outlet, RootRoute } from '@tanstack/react-router'
import type { RouterContext } from '../router'

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
          activeOptions={{ exact: true }}
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
    </>
  )
}
