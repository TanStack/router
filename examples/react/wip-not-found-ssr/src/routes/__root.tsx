import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import * as React from 'react'
import { Link, Outlet, rootRouteWithContext } from '@tanstack/react-router'
import { DehydrateRouter } from '@tanstack/react-router-server/client'
import { RouterContext } from '../routerContext'

export const Route = rootRouteWithContext<RouterContext>()({
  component: RootComponent,
  wrapInSuspense: true,
  notFoundComponent: () => {
    return (
      <>
        <p>Global not found</p>
      </>
    )
  },
})

function RootComponent() {
  return (
    <>
      <div className="p-2 flex gap-2 text-lg">
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
          // @ts-expect-error This page isnt suppose to exist
          to="/does-not-exist"
          activeProps={{
            className: 'font-bold',
          }}
        >
          This page does not exist
        </Link>
      </div>
      <hr />
      <Outlet /> {/* Start rendering router matches */}
      <TanStackRouterDevtools position="bottom-right" />
      <DehydrateRouter />
    </>
  )
}
