import * as React from 'solid-js'
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useRouterState,
} from '@tanstack/solid-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Spinner } from '../components/Spinner'
import { Breadcrumbs } from '../components/Breadcrumbs'
import type { Auth } from '../utils/auth'

function RouterSpinner() {
  const isLoading = useRouterState({ select: (s) => s.status === 'pending' })
  return <Spinner show={isLoading()} />
}

export const Route = createRootRouteWithContext<{
  auth: Auth
}>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <div class={`min-h-screen flex flex-col`}>
        <div class={`flex items-center border-b gap-2`}>
          <h1 class={`text-3xl p-2`}>Kitchen Sink</h1>
          <Breadcrumbs />
          {/* Show a global spinner when the router is transitioning */}
          <div class={`text-3xl`}>
            <RouterSpinner />
          </div>
        </div>
        <div class={`flex-1 flex`}>
          <div class={`divide-y w-56`}>
            {(
              [
                ['/', 'Home'],
                ['/dashboard', 'Dashboard'],
                ['/expensive', 'Expensive'],
                ['/layout-a', 'Layout A'],
                ['/layout-b', 'Layout B'],
                ['/profile', 'Profile'],
                ['/login', 'Login'],
                ['/route-group', 'Route Group'],
              ] as const
            ).map(([to, label]) => {
              return (
                <div>
                  <Link
                    to={to}
                    activeOptions={
                      {
                        // If the route points to the root of it's parent,
                        // make sure it's only active if it's exact
                        // exact: to === '.',
                      }
                    }
                    preload="intent"
                    class={`block py-2 px-3 text-blue-700`}
                    // Make "active" links bold
                    activeProps={{ class: `font-bold` }}
                  >
                    {label}
                  </Link>
                </div>
              )
            })}
          </div>
          <div class={`flex-1 border-l`}>
            {/* Render our first route match */}
            <Outlet />
          </div>
        </div>
      </div>
      {/* <TanStackRouterDevtools position="bottom-right" /> */}
    </>
  )
}
