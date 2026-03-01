import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_pathlessLayout')({
  component: LayoutComponent,
})

/**
 * Layout component that renders a header and an Outlet for nested routes.
 *
 * @returns A JSX element containing a container with a top header and an <Outlet /> for nested route content.
 */
function LayoutComponent() {
  return (
    <div className="p-2">
      <div className="border-b">I'm a layout</div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
