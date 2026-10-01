import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('an unchanged Link keeps its scheduled preload across a parent render', async () => {
  const loader = vi.fn(() => null)
  const root = createRootRoute({ component: Outlet })
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: function Index() {
      const [count, setCount] = React.useState(0)
      return (
        <>
          <button onClick={() => setCount(count + 1)}>Render {count}</button>
          <Link
            to="/target"
            data-render={count}
            preload="intent"
            preloadDelay={50}
          >
            Target
          </Link>
        </>
      )
    },
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    loader,
  })
  const router = createRouter({
    routeTree: root.addChildren([index, target]),
    history: createMemoryHistory(),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'Target' })
  fireEvent.mouseEnter(link)
  fireEvent.click(screen.getByRole('button', { name: 'Render 0' }))
  await waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
  router.history.destroy()
})

test.each([false, true])(
  'departing Link selectors remain idle through completed rendering (suspended: %s)',
  async (suspended) => {
    let ready = !suspended
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = () => {
        ready = true
        resolve()
      }
    })
    const search = vi.fn((value: Record<string, unknown>) => value)
    const root = createRootRoute({ component: Outlet })
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => (
        <>
          {Array.from({ length: 20 }, (_, i) => (
            <Link key={i} to="/target" search={search}>
              Target {i}
            </Link>
          ))}
        </>
      ),
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target',
      component: () => {
        if (!ready) {
          throw pending
        }
        return <div>Destination</div>
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([index, target]),
      history: createMemoryHistory(),
    })
    render(<RouterProvider router={router} />)
    await screen.findByRole('link', { name: 'Target 0' })
    const before = search.mock.calls.length
    await act(async () => {
      const navigation = router.navigate({
        to: '/target',
        search: { changed: true },
      } as any)
      setTimeout(release, 0)
      await navigation
    })
    await screen.findByText('Destination')
    expect(search).toHaveBeenCalledTimes(before)
    router.history.destroy()
  },
)
