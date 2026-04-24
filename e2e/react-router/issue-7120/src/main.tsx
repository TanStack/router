import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { fetchPosts } from './posts'
import './styles.css'

const rootRoute = createRootRoute({
  component: RootComponent,
  pendingMs: 0,
  pendingComponent: () => <div data-testid="root-pending">loading</div>,
  beforeLoad: async ({ matches }) => {
    if (matches.find((match) => match.routeId === '/posts')) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
    throw redirect({ to: '/posts' })
  },
})

function RootComponent() {
  return <Outlet />
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <div>Home</div>,
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return fetchPosts()
  },
}).lazy(() => import('./posts.lazy').then((d) => d.Route))

const routeTree = rootRoute.addChildren([indexRoute, postsRoute])

const router = createRouter({
  routeTree,
  defaultViewTransition: true,
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
