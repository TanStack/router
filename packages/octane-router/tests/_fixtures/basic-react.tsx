// The SAME router app as basic.tsrx, authored in React-style .tsx — className,
// bare `{expr}` holes, `return <jsx>` — proving the binding is consumed identically
// across dialects (the whole point of octane's JSX backwards-compat).
import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
  Link,
  useParams,
} from '@tanstack/octane-router'
import { createMemoryHistory } from '@tanstack/octane-router'

function RootLayout() {
  return (
    <div className="root">
      <nav>
        <Link to="/" className="nav-home">
          Home
        </Link>
        <Link to="/about" className="nav-about">
          About
        </Link>
      </nav>
      <Outlet />
    </div>
  )
}

function IndexPage() {
  return <h1 className="index">Index</h1>
}

function AboutPage() {
  return <h1 className="about">About page</h1>
}

function ItemPage() {
  const params = useParams({ strict: false })
  return <h1 className="item">{'Item ' + params.id}</h1>
}

export function makeRouter(initial: string) {
  const rootRoute = createRootRoute({ component: RootLayout })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: IndexPage,
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    component: AboutPage,
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'item/$id',
    component: ItemPage,
  })
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute, itemRoute]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
}
