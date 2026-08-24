import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, onTestFinished, test } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

function createGate() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

afterEach(cleanup)

test('#8128: returning from a layout-owned fuzzy not-found retains only through its owner', async () => {
  const beforeLoadStarted = createGate()
  const beforeLoadGate = createGate()
  onTestFinished(() => beforeLoadGate.resolve())
  let gateNextBeforeLoad = false

  const rootRoute = createRootRoute({ component: Outlet })
  const agentsLayoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: '_agents',
    component: () => (
      <section>
        <h1>Agent operations</h1>
        <Outlet />
      </section>
    ),
    notFoundComponent: () => <p>Agent page not found</p>,
  })
  const agentsRoute = createRoute({
    getParentRoute: () => agentsLayoutRoute,
    path: '/agents',
    beforeLoad: async () => {
      if (gateNextBeforeLoad) {
        gateNextBeforeLoad = false
        beforeLoadStarted.resolve()
        await beforeLoadGate.promise
      }
    },
    pendingMs: 0,
    pendingMinMs: 0,
    pendingComponent: () => <p role="status">Loading agents</p>,
    component: () => <p>Agents directory</p>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      agentsLayoutRoute.addChildren([agentsRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/agents'] }),
  })

  let navigation: Promise<void> | undefined
  try {
    render(<RouterProvider router={router} />)

    expect(await screen.findByText('Agents directory')).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Agent operations' }),
    ).toBeVisible()

    await act(async () => {
      navigation = router.navigate({ to: '/agents/missing' } as any)
      await navigation
    })

    expect(
      screen.getByRole('heading', { name: 'Agent operations' }),
    ).toBeVisible()
    expect(screen.getByText('Agent page not found')).toBeVisible()
    expect(screen.queryByText('Agents directory')).not.toBeInTheDocument()

    gateNextBeforeLoad = true
    await act(async () => {
      navigation = router.navigate({ to: '/agents' })
      await beforeLoadStarted.promise
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(
      screen.getByRole('heading', { name: 'Agent operations' }),
    ).toBeVisible()
    expect(screen.queryByText('Agent page not found')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading agents')

    await act(async () => {
      beforeLoadGate.resolve()
      await navigation
    })

    expect(screen.getByText('Agents directory')).toBeVisible()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  } finally {
    await act(async () => {
      await Promise.allSettled(navigation ? [navigation] : [])
    })
  }
})
