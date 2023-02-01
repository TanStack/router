import type { Component } from 'solid-js'
import { Link } from '@tanstack/solid-router'

const App: Component = () => {
  return (
    <>
      <div class="p-2 flex gap-2 text-lg">
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
      {/* <Outlet /> */}
      {/* Start rendering router matches */}
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </>
  )
}

export default App
