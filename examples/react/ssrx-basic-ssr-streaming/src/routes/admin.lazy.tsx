import { createLazyFileRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/admin')({
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <>
      <nav className="border-b flex gap-3 pb-5">
        <Link
          to="/admin"
          className="[&.active]:font-bold"
          activeOptions={{ exact: true }}
        >
          Admin Home
        </Link>

        <Link to="/admin/members" className="[&.active]:font-bold">
          Members
        </Link>
      </nav>

      <div className="pt-4">
        <Outlet />
      </div>
    </>
  )
}
