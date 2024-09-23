import { render } from '@testing-library/react'
import { bench, describe } from 'vitest'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  interpolatePath,
  Link,
  RouterContextProvider,
  useRouter,
} from '../src'

const createTestRouter = (routesCount: number) => {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/' })
  const paramRoutes = Array.from({ length: routesCount }).map((_, i) =>
    createRoute({
      getParentRoute: () => indexRoute,
      path: `/params/$param${i}`,
    }),
  )
  const routeTree = rootRoute.addChildren([indexRoute, ...paramRoutes])
  return createRouter({
    routeTree,
    history: createMemoryHistory(),
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
  const router = createTestRouter(numberOfRoutes)

  bench(
    'hardcoded href',
    () => {
      render(
        <RouterContextProvider router={router}>
          {Array.from({ length: numberOfLinks }).map((_, i) => (
            <a key={i} href={`/params/${i}`}>
              {i}
            </a>
          ))}
        </RouterContextProvider>,
      )
    },
    { warmupIterations: 0 },
  )

  bench(
    'interpolate path',
    () => {
      render(
        <RouterContextProvider router={router}>
          {Array.from({ length: numberOfLinks }).map((_, i) => (
            <InterpolatePathLink
              key={i}
              to={`/params/$param${matchedParamId}`}
              params={{ [`param${matchedParamId}`]: i }}
            >
              {i}
            </InterpolatePathLink>
          ))}
        </RouterContextProvider>,
      )
    },
    { warmupIterations: 0 },
  )

  bench(
    'build location',
    () => {
      render(
        <RouterContextProvider router={router}>
          {Array.from({ length: numberOfLinks }).map((_, i) => (
            <BuildLocationLink
              key={i}
              to={`/params/$param${matchedParamId}`}
              params={{ [`param${matchedParamId}`]: i }}
            >
              {i}
            </BuildLocationLink>
          ))}
        </RouterContextProvider>,
      )
    },
    { warmupIterations: 0 },
  )

  bench(
    'link component',
    () => {
      render(
        <RouterContextProvider router={router}>
          {Array.from({ length: numberOfLinks }).map((_, i) => (
            <Link
              key={i}
              to={`/params/$param${matchedParamId}`}
              params={{ [`param${matchedParamId}`]: i }}
            >
              {i}
            </Link>
          ))}
        </RouterContextProvider>,
      )
    },
    { warmupIterations: 0 },
  )
})
