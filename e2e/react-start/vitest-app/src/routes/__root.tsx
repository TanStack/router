import { Link, Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <nav aria-label="Main">
        <Link to="/">Home</Link>
      </nav>
      <Outlet />
    </>
  )
}
