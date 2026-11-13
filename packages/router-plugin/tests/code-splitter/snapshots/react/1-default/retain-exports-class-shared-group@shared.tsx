import * as React from 'react'
import { Outlet } from '@tanstack/react-router'
class Layout extends React.Component {
  render() {
    return (
      <main>
        <Outlet />
      </main>
    )
  }
}
export { Layout }
