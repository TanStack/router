import * as React from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
function Layout() {
  return (
    <main>
      <Outlet />
    </main>
  )
}
export { Layout as PublicLayout }
export const Route = createFileRoute('/_layout')({
  component: Layout,
  loader: () => Layout.name,
})
