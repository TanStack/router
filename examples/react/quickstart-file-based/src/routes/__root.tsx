import * as React from 'react'
import {
  Link,
  Outlet,
  createRootRoute,
  useMatchRoute,
  useRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  const matchRoute = useMatchRoute()
  const isHome = !!matchRoute({ to: '/' })

  const { history } = useRouter()
  const handleBack = () => history.back()

  return (
    <>
      <div className="p-2 flex gap-2 text-lg">
        {!isHome ? <button onClick={handleBack}>Back</button> : null}
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
          to={'/about'}
          activeProps={{
            className: 'font-bold',
          }}
        >
          About
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}
