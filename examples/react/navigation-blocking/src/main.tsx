import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import React from 'react'
import ReactDOM from 'react-dom/client'

const rootRoute = createRootRoute({
  component: RootComponent,
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
          to="/editor-1"
          activeProps={{
            className: 'font-bold',
          }}
        >
          Editor 1
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </>
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

const editor1Route = createRoute({
  getParentRoute: () => rootRoute,
  path: 'editor-1',
  component: Editor1Component,
})

function Editor1Component() {
  const [value, setValue] = React.useState('')
  const [useCustomBlocker, setUseCustomBlocker] = React.useState(false)

  const { proceed, reset, status } = useBlocker({
    blockerFn: useCustomBlocker
      ? undefined
      : () => window.confirm('Are you sure you want to leave editor 1?'),
    condition: value,
  })

  return (
    <div className="flex flex-col p-2">
      <h3>Editor 1</h3>
      <label>
        <input
          type="checkbox"
          checked={useCustomBlocker}
          onChange={(e) => setUseCustomBlocker(e.target.checked)}
        />{' '}
        Use custom blocker
      </label>
      <div>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="border"
        />
      </div>
      {status === 'blocked' && (
        <div className="mt-2">
          <div>Are you sure you want to leave editor 1?</div>
          <button
            className="bg-lime-500 text-white rounded p-1 px-2 mr-2"
            onClick={proceed}
          >
            YES
          </button>
          <button
            className="bg-red-500 text-white rounded p-1 px-2"
            onClick={reset}
          >
            NO
          </button>
        </div>
      )}
      <hr className="m-2" />
      <Link to="/editor-1/editor-2">Go to Editor 2</Link>
      <Outlet />
    </div>
  )
}

const editor2Route = createRoute({
  getParentRoute: () => editor1Route,
  path: 'editor-2',
  component: Editor2Component,
})

function Editor2Component() {
  const [value, setValue] = React.useState('')

  useBlocker({
    blockerFn: () => window.confirm('Are you sure you want to leave editor 2?'),
    condition: value,
  })

  return (
    <div className="p-2">
      <h3>Editor 2</h3>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="border"
      />
    </div>
  )
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  editor1Route.addChildren([editor2Route]),
])

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

// Register things for typesafety
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
