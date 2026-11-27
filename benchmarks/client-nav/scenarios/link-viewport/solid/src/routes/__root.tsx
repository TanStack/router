import { Link, Outlet, createRootRoute } from '@tanstack/solid-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <nav>
        <Link to="/" data-testid="go-home">
          Home
        </Link>
        <Link to="/list" data-testid="go-list">
          List
        </Link>
      </nav>
      <Outlet />
    </>
  )
}
