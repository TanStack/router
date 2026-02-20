import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { z } from 'zod'
import './styles.css'

const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => {
    return <p>This is the notFoundComponent configured on root route</p>
  },
})

function RootComponent() {
  return (
    <div className="bg-gradient-to-r from-green-700 to-lime-600 text-white">
      <div className="p-2 flex gap-2 text-lg bg-black/40 shadow-xl">
        <Link
          to="/"
          activeProps={{
            className: 'font-bold',
          }}
          activeOptions={{ exact: true }}
        >
          Home
        </Link>
        <Link
          to="/state-examples"
          activeProps={{
            className: 'font-bold',
          }}
        >
          State Examples
        </Link>
      </div>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </div>
  )
}
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexComponent,
})

function IndexComponent() {
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}

// Route to demonstrate various useHistoryState usages
const stateExamplesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'state-examples',
  component: StateExamplesComponent,
})

const stateDestinationRoute = createRoute({
  getParentRoute: () => stateExamplesRoute,
  path: 'destination',
  validateState: (input: {
    example: string
    count: number
    options: Array<string>
  }) =>
    z
      .object({
        example: z.string(),
        count: z.number(),
        options: z.array(z.string()),
      })
      .parse(input),
  component: StateDestinationComponent,
})

function StateExamplesComponent() {
  return (
    <div className="p-2">
      <h3 className="text-xl font-bold mb-4">useHistoryState Examples</h3>
      <div className="flex gap-4">
        <Link
          to={stateDestinationRoute.to}
          state={{
            example: 'Test Data',
            count: 42,
            options: ['Option 1', 'Option 2', 'Option 3'],
          }}
          className="bg-green-600 px-3 py-2 rounded hover:bg-green-500"
        >
          Link with State
        </Link>
      </div>
      <Outlet />
    </div>
  )
}

function StateDestinationComponent() {
  const state = stateDestinationRoute.useHistoryState()
  return (
    <div className="mt-4 p-4 bg-black/20 rounded">
      <h4 className="text-lg font-bold mb-2">State Data Display</h4>
      <pre className="whitespace-pre-wrap bg-black/30 p-2 rounded text-sm mt-2">
        {JSON.stringify(state, null, 2)}
      </pre>
    </div>
  )
}

const routeTree = rootRoute.addChildren([
  stateExamplesRoute.addChildren([stateDestinationRoute]),
  indexRoute,
])

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultStaleTime: 5000,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(<RouterProvider router={router} />)
}
