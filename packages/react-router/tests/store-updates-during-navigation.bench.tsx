import { bench, describe, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useParams,
  useRouterState,
  useSearch,
} from '../src'

// Navigation cost under store-subscriber fan-out. A retained layout mounts
// `subscribers` broad `useRouterState` consumers plus as many narrow
// `useSearch`/`useParams` consumers. Every navigation re-runs two retained
// synchronous `beforeLoad`s and a stale layout loader, so the router publishes
// fetching transitions on presented matches. All selections are stable, so the
// measured work is store propagation and selection rather than re-rendering.
async function setup(subscribers: number) {
  let notifications = 0

  const Broad = () => {
    useRouterState({ select: (state) => state.location.pathname })
    return null
  }
  const Narrow = () => {
    useSearch({ strict: false })
    useParams({ strict: false })
    return null
  }
  const Counter = () => {
    useRouterState({
      select: () => {
        notifications++
      },
    })
    return null
  }

  const rootRoute = createRootRoute({
    beforeLoad: () => ({ root: true }),
    component: () => (
      <>
        <Counter />
        <Outlet />
      </>
    ),
  })
  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'layout',
    beforeLoad: () => ({ layout: true }),
    loader: () => ({ items: [] }),
    staleTime: 0,
    component: () => (
      <>
        {Array.from({ length: subscribers }, (_, index) => (
          <Broad key={index} />
        ))}
        {Array.from({ length: subscribers }, (_, index) => (
          <Narrow key={index} />
        ))}
        <Outlet />
      </>
    ),
  })
  const pages = ['a', 'b'].map((path) =>
    createRoute({
      getParentRoute: () => layoutRoute,
      path,
      beforeLoad: () => ({ page: path }),
      loader: () => path,
      component: () => <p>{path}</p>,
    }),
  )
  const router = createRouter({
    routeTree: rootRoute.addChildren([layoutRoute.addChildren(pages)]),
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  })
  render(<RouterProvider router={router} />)
  await router.load()

  const lap = async () => {
    await router.navigate({ to: '/b', replace: true })
    await router.navigate({ to: '/a', replace: true })
  }
  await lap()
  const before = notifications
  await lap()
  const perNavigation = (notifications - before) / 2
  expect(router.state.location.pathname).toBe('/a')
  expect(perNavigation).toBeGreaterThan(0)
  return { lap, perNavigation }
}

for (const subscribers of [0, 50, 200]) {
  const { lap, perNavigation } = await setup(subscribers)
  describe(`${subscribers} broad + ${subscribers} narrow subscribers (${perNavigation} store updates per navigation)`, () => {
    bench('two navigations with retained beforeLoads and a stale loader', lap, {
      time: 1000,
      warmupTime: 200,
    })
  })
}
