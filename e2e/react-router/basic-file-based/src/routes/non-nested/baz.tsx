import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/non-nested/baz')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <div data-testid="non-nested-baz-heading">Hello "/non-nested/baz"!</div>
      <Outlet />
    </>
  )
}
