import ReactDOM from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useMatchRoute,
} from '@tanstack/react-router'
import { useEffect } from 'react'

/**
 * This e2e test demonstrates the React Compiler stale closure issue with useMatchRoute.
 *
 * The issue: When matchRoute results are consumed in useEffect dependencies, React
 * Compiler's aggressive memoization causes the callback to capture stale router state.
 * The useEffect pattern (lines 30-33) is critical - without it, the bug doesn't manifest.
 *
 * With the fix: routerState is included in useCallback dependencies, ensuring the
 * callback is recreated when navigation occurs, so useEffect gets fresh values.
 */

function RootComponent() {
  const matchRoute = useMatchRoute()

  const isHome = !!matchRoute({ to: '/home' })
  const isAbout = !!matchRoute({ to: '/about' })

  useEffect(() => {
    console.log('isHome', isHome);
    console.log('isAbout', isAbout);
  }, [isHome])


  return (
    <div style={{ padding: '20px' }}>
      <h1>React Compiler useMatchRoute Test</h1>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <Link
          to="/home"
          style={{
            padding: '8px 16px',
            background: isHome ? '#4CAF50' : '#ddd',
            color: isHome ? 'white' : 'black',
            textDecoration: 'none',
            borderRadius: '4px',
          }}
          data-testid="link-home"
        >
          Home
        </Link>
        <Link
          to="/about"
          style={{
            padding: '8px 16px',
            background: isAbout ? '#4CAF50' : '#ddd',
            color: isAbout ? 'white' : 'black',
            textDecoration: 'none',
            borderRadius: '4px',
          }}
          data-testid="link-about"
        >
          About
        </Link>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h2>Match Status:</h2>
        <div>
          <strong>Is Home:</strong>{' '}
          <span data-testid="match-home">{isHome ? 'true' : 'false'}</span>
        </div>
        <div>
          <strong>Is About:</strong>{' '}
          <span data-testid="match-about">{isAbout ? 'true' : 'false'}</span>
        </div>
      </div>

      <hr />

      <Outlet />
    </div>
  )
}

const rootRoute = createRootRoute({
  component: RootComponent,
})

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/home',
  component: () => (
    <div data-testid="content-home">
      <h3>Home Page</h3>
      <p>Welcome to the home page!</p>
    </div>
  ),
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: () => (
    <div data-testid="content-about">
      <h3>About Page</h3>
      <p>This is the about page.</p>
    </div>
  ),
})

const routeTree = rootRoute.addChildren([homeRoute, aboutRoute])

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
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
