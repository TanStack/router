// Solid's observe tier: the match publish inside `startTransition` is
// declared to the attribution engine as the navigation, so the holds and
// re-runs it causes are named after the route and the record spans from
// the history change that started the load. `OBSERVE` is defined on the
// dev build the tests resolve; in production it is undefined and the
// declaration folds out.
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { attribution } from 'solid-js/attribution'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

beforeEach(() => attribution.enable({ log: false }))
afterEach(() => {
  attribution.disable()
  cleanup()
})

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function makeRouter(loaderMs: number) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-testid="home">Home</div>,
  })
  const userRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users/$id',
    loader: async ({ params }) => {
      await sleep(loaderMs)
      return { name: `user ${params.id}` }
    },
    component: () => {
      const data = userRoute.useLoaderData()
      return <div data-testid="user">{data().name}</div>
    },
  })
  const routeTree = rootRoute.addChildren([indexRoute, userRoute])
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

test('the match publish is declared as the navigation, dated from the history change', async () => {
  const router = makeRouter(30)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())
  // The initial load publishes matches for the location already shown: not
  // a navigation.
  expect(attribution.navigations()).toHaveLength(0)

  const requested = performance.now()
  await router.navigate({ to: '/users/$id', params: { id: '42' } })
  await waitFor(() => expect(screen.getByTestId('user')).toBeTruthy())
  await sleep(0)

  // One record for the navigation — the pending offer (a match with
  // `status: 'pending'`) is published undeclared.
  const navs = attribution.navigations()
  expect(navs).toHaveLength(1)
  const nav = navs[0]!
  expect(nav.name).toBe('/users/$id')
  expect(nav.to).toBe('/users/42')
  expect(nav.from).toBe('/')
  expect(nav.params).toEqual({ id: '42' })
  expect(nav.outcome).toBe('committed')
  // `at` is the history change inside navigate(), before the loader ran:
  // the record spans the loader wait even though the publish came after it.
  expect(nav.at).toBeGreaterThanOrEqual(requested)
  expect(nav.at).toBeLessThan(requested + 30)
  expect(nav.settledMs!).toBeGreaterThanOrEqual(30)
})

test('a navigation superseded before it published leaves one record for the destination that showed', async () => {
  const router = makeRouter(30)
  render(() => <RouterProvider router={router} />)
  await waitFor(() => expect(screen.getByTestId('home')).toBeTruthy())

  const requested = performance.now()
  void router.navigate({ to: '/users/$id', params: { id: '1' } })
  await sleep(5)
  await router.navigate({ to: '/users/$id', params: { id: '2' } })
  await waitFor(() =>
    expect(screen.getByTestId('user').textContent).toBe('user 2'),
  )
  await sleep(0)

  const navs = attribution.navigations()
  expect(navs).toHaveLength(1)
  expect(navs[0]!.to).toBe('/users/2')
  // Dated from the first request: that is when the user started waiting.
  expect(navs[0]!.at).toBeLessThan(requested + 5)
})
