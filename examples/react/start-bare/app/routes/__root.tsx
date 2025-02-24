import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <Link to="/">Index</Link>
      <Link to="/about">About</Link>
      <React.Suspense>
        <Outlet />
      </React.Suspense>
    </>
  )
}
