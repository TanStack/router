import * as React from 'react'
import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'

import { useAuth } from '../auth'

export const Route = createFileRoute('/_auth')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: AuthLayout,
})

function AuthLayout() {
  const navigate = Route.useNavigate()
  const auth = useAuth()

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      auth.setUser(null)
      navigate({ to: '/' })
    }
  }

  return (
    <div className="p-2 h-full">
      <h1>Authenticated Route</h1>
      <p>This route's content is only visible to authenticated users.</p>
      <ul className="py-2 flex gap-2">
        <li>
          <Link
            to="/dashboard"
            className="hover:underline data-[status='active']:font-semibold"
          >
            Dashboard
          </Link>
        </li>
        <li>
          <Link
            to="/invoices/"
            className="hover:underline data-[status='active']:font-semibold"
          >
            Invoices
          </Link>
        </li>
        <li>
          <button
            type="button"
            className="hover:underline"
            onClick={handleLogout}
          >
            Logout
          </button>
        </li>
      </ul>
      <hr />
      <Outlet />
    </div>
  )
}
