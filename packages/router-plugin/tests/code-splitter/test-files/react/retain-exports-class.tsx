import * as React from 'react'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export class Layout extends React.Component {
  render() {
    return (
      <main>
        <Outlet />
      </main>
    )
  }
}

export const Route = createFileRoute('/_layout')({
  component: Layout,
})
