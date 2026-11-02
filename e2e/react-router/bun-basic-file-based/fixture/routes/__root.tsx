import { createRootRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/">Home</Link> <Link to="/about">About</Link>{' '}
        <Link to="/details">Details</Link>{' '}
        <Link to="/second build">Second build</Link>
      </nav>
      <Outlet />
    </>
  ),
})
