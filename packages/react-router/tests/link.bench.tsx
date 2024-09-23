import { render, act } from '@testing-library/react'
import { bench, describe } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  interpolatePath,
  Link,
  RouterProvider,
  useRouter,
} from '../src'

const createRouterRenderer =
  (routesCount: number) => (children: React.ReactNode) => {
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => children,
    })
    const paramRoutes = Array.from({ length: routesCount }).map((_, i) =>
      createRoute({
        getParentRoute: () => indexRoute,
        path: `/params/$param${i}`,
      }),
    )
    const routeTree = rootRoute.addChildren([indexRoute, ...paramRoutes])
    return createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
  }

const InterpolatePathLink = ({ to, params, children }: LinkProps) => {
  const href = interpolatePath({ path: to, params })
  return <a href={href}>{children}</a>
}

const BuildLocationLink = ({ to, params, children }: LinkProps) => {
  const router = useRouter()
  const { href } = router.buildLocation({ to, params })
  return <a href={href}>{children}</a>
}

type LinkProps = React.PropsWithChildren<{
  to: string
  params: Record<string, string | number>
}>

describe.each([
  {
    name: 'small router (1 route with params)',
    numberOfRoutes: 1,
    matchedParamId: 0, // range from 0 to numberOfRoutes-1
    numberOfLinks: 5000,
  },
  {
    name: 'large router (1000 routes with params)',
    numberOfRoutes: 1000,
    matchedParamId: 500, // range from 0 to numberOfRoutes-1
    numberOfLinks: 5000,
  },
])('$name', ({ numberOfRoutes, numberOfLinks, matchedParamId }) => {
  const renderRouter = createRouterRenderer(numberOfRoutes)

  bench(
    'hardcoded href',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => (
          <a key={i} href={`/params/${i}`}>
            {i}
          </a>
        )),
      )
      render(<RouterProvider router={router} />)
    },
    { warmupIterations: 1 },
  )

  bench(
    'interpolate path',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => (
          <InterpolatePathLink
            key={i}
            to={`/params/$param${matchedParamId}`}
            params={{ [`param${matchedParamId}`]: i }}
          >
            {i}
          </InterpolatePathLink>
        )),
      )
      render(<RouterProvider router={router} />)
    },
    { warmupIterations: 1 },
  )

  bench(
    'build location',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => (
          <BuildLocationLink
            key={i}
            to={`/params/$param${matchedParamId}`}
            params={{ [`param${matchedParamId}`]: i }}
          >
            {i}
          </BuildLocationLink>
        )),
      )
      render(<RouterProvider router={router} />)
    },
    { warmupIterations: 1 },
  )

  bench(
    'link component',
    () => {
      const router = renderRouter(
        Array.from({ length: numberOfLinks }).map((_, i) => (
          <Link
            key={i}
            to={`/params/$param${matchedParamId}`}
            params={{ [`param${matchedParamId}`]: i }}
          >
            {i}
          </Link>
        )),
      )
      render(<RouterProvider router={router} />)
    },
    { warmupIterations: 1 },
  )
})
