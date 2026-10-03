import * as Solid from 'solid-js'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const releases: Array<() => void> = []
const operations = new Set<Promise<unknown>>()
afterEach(async () => {
  releases.splice(0).forEach((release) => release())
  await Promise.allSettled(operations)
  operations.clear()
  cleanup()
})

test('rewrite changes publish the location to the canonical source while native route membership is staged', async () => {
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  releases.push(release)
  const [holding, setHolding] = Solid.createSignal(false)
  let publishedSecond = false
  function AppResource() {
    const [data] = Solid.createResource(holding, () =>
      barrier.then(() => 'Ready'),
    )
    return <span>{data()}</span>
  }
  const root = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
    component: () => <Outlet />,
  })
  const first = createRoute({
    getParentRoute: () => root,
    path: '/first',
    component: () => <h1>First</h1>,
  })
  const second = createRoute({
    getParentRoute: () => root,
    path: '/second',
    component: () => (
      <>
        <h1>Second</h1>
        <Link to="/target" search={true}>
          Second target
        </Link>
      </>
    ),
  })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const router = createRouter({
    routeTree: root.addChildren([first, second, target]),
    history: createMemoryHistory({ initialEntries: ['/first?page=1'] }),
  })
  const unsubscribe = router.subscribe(
    'onBeforeRouteMount',
    ({ toLocation }) => {
      if (toLocation.pathname === '/second') {
        setHolding(true)
        publishedSecond = true
      }
    },
  )
  render(() => (
    <Solid.Suspense fallback={<h1>App waiting</h1>}>
      <AppResource />
      <RouterProvider router={router} />
    </Solid.Suspense>
  ))
  await screen.findByText('First')
  const departure = router.navigate({ to: '/second', search: { page: 2 } })
  operations.add(departure)
  await waitFor(() => expect(publishedSecond).toBe(true))
  router.update({
    rewrite: {
      input: ({ url }) => {
        url.searchParams.set('page', '9')
        return url
      },
    },
  })
  expect(router.latestLocation.search.page).toBe(9)
  release()
  await expect(departure).resolves.toBeUndefined()
  await screen.findByText('Second')
  expect(screen.getByText('Second target')).toHaveAttribute(
    'href',
    '/target?page=9',
  )
  unsubscribe()
})
