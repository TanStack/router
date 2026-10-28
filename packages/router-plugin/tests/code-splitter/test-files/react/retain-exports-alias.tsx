import * as React from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'

function Layout() {
  return (
    <main>
      <Outlet />
    </main>
  )
}

function loadLayout() {
  return { title: 'layout' }
}

export { Layout as View, loadLayout as load }

export const Route = createFileRoute('/_layout')({
  component: Layout,
  loader: loadLayout,
})
