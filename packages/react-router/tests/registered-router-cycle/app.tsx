// A code-based app that registers its router in the same program and uses
// route-bound APIs inside its own routes. Resolving any of them must not need
// the registered router while the routes are still being inferred.
import * as React from 'react'
import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouteMask,
  createRouter,
  useNavigate,
} from '@tanstack/react-router'

const rootRoute = createRootRoute({ component: Root })

const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$itemId',
  // Contextual types of lifecycle options name the registered router.
  beforeLoad: ({ buildLocation }) => {
    void buildLocation
  },
  loader: ({ params, navigate }) => {
    if (params.itemId === 'old') {
      throw itemRoute.redirect({ to: '.', params: { itemId: 'new' } })
    }
    void navigate
    return { name: `item ${params.itemId}` }
  },
  component: Item,
})

const publicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/public/$name',
  component: PublicItem,
})

const routeTree = rootRoute.addChildren([itemRoute, publicRoute])

const mask = createRouteMask({
  routeTree,
  from: '/items/$itemId',
  to: '/public/$name',
  params: (previous) => ({ name: previous.itemId }),
})

export const router = createRouter({ routeTree, routeMasks: [mask] })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function Root() {
  const navigate = useNavigate()
  return (
    <>
      <Link to="/items/$itemId" params={{ itemId: '1' }}>
        Item
      </Link>
      <button onClick={() => navigate({ to: '/' })}>Home</button>
      <Outlet />
    </>
  )
}

function itemLink(index: number) {
  return (
    <itemRoute.Link key={index} to="." params={{ itemId: String(index) }}>
      {index}
    </itemRoute.Link>
  )
}

function Item() {
  const data = itemRoute.useLoaderData()
  const params = itemRoute.useParams()
  const navigate = itemRoute.useNavigate()
  return (
    <div>
      <h1>{data.name}</h1>
      <p>{params.itemId}</p>
      <button onClick={() => navigate({ to: '.' })}>Reload</button>
      {[1, 2].map(itemLink)}
    </div>
  )
}

function PublicItem() {
  const { name } = publicRoute.useParams()
  return <publicRoute.Link to=".">{name}</publicRoute.Link>
}
