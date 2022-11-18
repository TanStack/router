import * as React from 'react'
import { Outlet, Link } from '@tanstack/react-router'
// import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export function App() {
  return (
    // Build our routes and render our router
    <>
      <div>
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
          to="/posts"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Posts
        </Link>
      </div>
      <hr />
      <Outlet />
      {/* <TanStackRouterDevtools /> */}
    </>
  )
}
