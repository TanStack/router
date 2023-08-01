import * as React from 'react'
import { Link, Outlet, useRouter } from '@tanstack/router'
import { Spinner } from '../components/Spinner'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { useLoaderClient } from '@tanstack/react-loaders'
import { routerContext } from '../routerContext'

export const rootRoute = routerContext.createRootRoute({
  component: () => {
    const router = useRouter()
    const loaderClient = useLoaderClient()

    return (
      <>
        <div className={`min-h-screen flex flex-col`}>
          <div className={`flex items-center border-b gap-2`}>
            <h1 className={`text-3xl p-2`}>Kitchen Sink</h1>
            {/* Show a global spinner when the router is transitioning */}
            <div
              className={`text-3xl duration-300 delay-0 opacity-0 ${
                router.state.status === 'pending' ||
                loaderClient.state.isLoading
                  ? ` duration-1000 opacity-40`
                  : ''
              }`}
            >
              <Spinner />
            </div>
          </div>
          <div className={`flex-1 flex`}>
            <div className={`divide-y w-56`}>
              {(
                [
                  ['/', 'Home'],
                  ['/dashboard', 'Dashboard'],
                  ['/expensive', 'Expensive'],
                  ['/authenticated', 'Authenticated'],
                  ['/layout-a', 'Layout A'],
                  ['/layout-b', 'Layout B'],
                ] as const
              ).map(([to, label]) => {
                return (
                  <div key={to}>
                    <Link
                      to={to}
                      activeOptions={{
                        // If the route points to the root of it's parent,
                        // make sure it's only active if it's exact
                        exact: to === '/',
                      }}
                      className={`block py-2 px-3 text-blue-700`}
                      // Make "active" links bold
                      activeProps={{ className: `font-bold` }}
                    >
                      {label}
                    </Link>
                  </div>
                )
              })}
            </div>
            <div className={`flex-1 border-l border-gray-200`}>
              {/* Render our first route match */}
              <Outlet />
            </div>
          </div>
        </div>
        <TanStackRouterDevtools position="bottom-right" />
      </>
    )
  },
})
