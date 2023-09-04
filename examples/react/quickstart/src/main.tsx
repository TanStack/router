// import './styles.css'

import React, { StrictMode } from 'react'
import * as ReactDOM from 'react-dom'

import {
  Outlet,
  RouterProvider,
  Link,
  Router,
  Route,
  RootRoute,
  useRouter,
  useSearch,
  createHashHistory,
} from '@tanstack/react-router'

function Root() {
  return (
    <>
      <div>
        <Link to="/">Home</Link> <Link to="/about">About</Link>
      </div>
      <hr />
      <Outlet />
    </>
  )
}

function Index() {
  const router = useRouter()
  const search = useSearch({ stric: false })

  const handleOnNavigateClick = () => {
    router.navigate({
      search: {
        test: ['value1', 'value2'],
      },
    })
  }

  return (
    <div>
      Welcome Home!
      {JSON.stringify(search, undefined, 2)}
      <div>
        <Link
          to="/"
          search={{
            test: ['electronics', 'gifts'],
          }}
        >
          Set Search via Link
        </Link>
        <br />
        <button onClick={handleOnNavigateClick}>Set Search Via Navigate</button>
        <br />
        <Link
          to="/"
          search={{
            test: ['testValue1'],
          }}
        >
          Set an array of 1
        </Link>
      </div>
    </div>
  )
}

function About() {
  return <div>Hello From about</div>
}

// Create a root route
const rootRoute = new RootRoute({
  component: Root,
})

// Create an index route
const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Index,
})

const aboutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: About,
})

// Create the route tree using your routes
const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

const history = createHashHistory()
// Create the router using your route tree
const router = new Router({
  routeTree,
  history,
  // parseSearch: parseSearchWith((value) => {
  //   console.log("debuggo parseSearch", value);
  //   return value;
  // })
  // stringifySearch: stringifySearchWith((v) => {
  //   console.log("debuggo string", v);

  //   return v;
  // })
})

// Register your router for maximum type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export default function App() {
  return <RouterProvider router={router} />
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}
