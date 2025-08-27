import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <div className="p-2 flex gap-2 text-lg border-b">
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
          to="/users"
          activeProps={{
            className: 'font-bold',
          }}
          search={{}} // You have to pass an empty object to override the persisted search params
        >
          Users
        </Link>{' '}
        <Link
          to="/products"
          activeProps={{
            className: 'font-bold',
          }}
          search={{}}
        >
          Products
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  )
}
