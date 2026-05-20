import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import './styles.css'

const posts = [
  {
    id: '1',
    title:
      'sunt aut facere repellat provident occaecati excepturi optio reprehenderit',
  },
]

const rootRoute = createRootRoute({
  component: () => <Outlet />,
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
    return posts
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
