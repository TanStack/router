import * as React from 'react'
import { Outlet } from '@tanstack/react-router'
function Layout() {
  return (
    <main>
      <Outlet />
    </main>
  )
}
const SplitLoader = () => Layout.name
export { SplitLoader as loader }
