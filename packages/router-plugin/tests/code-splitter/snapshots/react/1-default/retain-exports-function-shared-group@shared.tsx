import * as React from 'react'
import { Outlet } from '@tanstack/react-router'
function Layout() {
  return (
    <main>
      <Outlet />
    </main>
  )
}
export { Layout }
