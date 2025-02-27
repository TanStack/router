import { Link, Outlet, createRootRoute } from '@tanstack/solid-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <div class="p-2 flex gap-2 text-lg">
        <Link
          to="/"
          activeProps={{
            class: 'font-bold',
          }}
          activeOptions={{ exact: true }}
        >
          Home
        </Link>{' '}
        <Link
          to="/about"
          activeProps={{
            class: 'font-bold',
          }}
        >
          About
        </Link>
      </div>
      <hr />
      <Outlet />
    </>
  )
}
