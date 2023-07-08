import * as React from 'react'
import ReactDOM from 'react-dom/client'
import {
  Link,
  RootRoute,
  Route,
  Router,
  RouterProvider,
} from '@tanstack/router'

const rootRoute = new RootRoute()

const indexRoute = new Route({
  path: '/',
  getParentRoute: () => rootRoute,
  component: function Index() {
    return (
      <div>
        <h3>customers</h3>
        <ul>
          {['a', 'b', 'c'].map((v) => (
            <li key={v}>
              <Link to="$customer" params={{ customer: v }}>
                {v}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  },
})

const customerRoute = new Route({
  path: '$customer',
  getParentRoute: () => rootRoute,
  component: function Customer({ useParams }) {
    const { customer } = useParams()
    return <p>Customer: {customer}</p>
  },
})

const routeTree = rootRoute.addChildren([indexRoute, customerRoute])

const router = new Router({ routeTree })
declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}

export default function App() {
  return <RouterProvider router={router} />
}

// Register things for typesafety
declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(
    // <React.StrictMode>
    <RouterProvider router={router} />,
    // </React.StrictMode>,
  )
}
