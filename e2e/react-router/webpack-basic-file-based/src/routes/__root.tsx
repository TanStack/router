import { Link, Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <div>
        <Link to="/" activeOptions={{ exact: true }}>
          Home
        </Link>{' '}
        <Link to="/about">About</Link> <Link to="/nest">Nest</Link>{' '}
        <Link to="/nest/foo">Nest Foo</Link>
      </div>
      <hr />
      <Outlet />
    </>
  )
}
