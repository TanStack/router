import * as React from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'
export function Layout() {
  return (
    <main>
      <Outlet />
    </main>
  )
}
export const Route = createFileRoute('/_layout')({
  component: Layout,
  loader: () => Layout.name,
})
