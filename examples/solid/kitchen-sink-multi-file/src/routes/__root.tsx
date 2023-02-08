import { useLoaderClient } from '@tanstack/solid-loaders'
import { Link, Outlet, RootRoute, useRouter } from '@tanstack/solid-router'
import { For } from 'solid-js'
import { Spinner } from '../components/Spinner'

export const rootRoute = new RootRoute({
  component: () => {
    const router = useRouter()
    const loaderClient = useLoaderClient()

    return (
      <>
        <div class={`min-h-screen flex flex-col`}>
          <div class={`flex items-center border-b gap-2`}>
            <h1 class={`text-3xl p-2`}>Kitchen Sink</h1>
            {/* Show a global spinner when the router is transitioning */}
            <div
              classList={{
                'text-3xl duration-300 delay-0 opacity-0': true,
                'duration-1000 opacity-40':
                  router.status === 'pending' || loaderClient.state.isLoading,
              }}
            >
              <Spinner />
            </div>
          </div>
          <div class={`flex-1 flex`}>
            <div class={`divide-y w-56`}>
              <For
                each={
                  [
                    ['/', 'Home'],
                    ['/dashboard', 'Dashboard'],
                    ['/expensive', 'Expensive'],
                    ['/authenticated', 'Authenticated'],
                    ['/layout-a', 'Layout A'],
                    ['/layout-b', 'Layout B'],
                  ] as const
                }
              >
                {([to, label]) => (
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
                      class={`block py-2 px-3 text-blue-700`}
                      // Make "active" links bold
                      activeProps={{ class: `font-bold` }}
                    >
                      {label}
                    </Link>
                  </div>
                )}
              </For>
            </div>
            <div class={`flex-1 border-l border-gray-200`}>
              {/* Render our first route match */}
              <Outlet />
            </div>
          </div>
        </div>
      </>
    )
  },
})
