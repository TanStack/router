import * as React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useRouter,
} from '../src'

afterEach(cleanup)

test('ordinary layout components keep their render counts across provider rerenders, invalidation, and sibling navigation', async () => {
  const rootRender = vi.fn()
  const layoutRender = vi.fn()
  const root = createRootRoute({
    component: function Root() {
      rootRender()
      return <Outlet />
    },
  })
  const parent = createRoute({
    getParentRoute: () => root,
    path: 'parent',
    component: function Layout() {
      layoutRender()
      return <Outlet />
    },
  })
  const a = createRoute({
    getParentRoute: () => parent,
    path: 'a',
    component: () => <p>Child A</p>,
  })
  const b = createRoute({
    getParentRoute: () => parent,
    path: 'b',
    component: () => <p>Child B</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([parent.addChildren([a, b])]),
    history: createMemoryHistory({ initialEntries: ['/parent/a'] }),
  })
  await router.load()
  const view = render(<RouterProvider router={router} />)
  await screen.findByText('Child A')
  const rootCalls = rootRender.mock.calls.length
  const layoutCalls = layoutRender.mock.calls.length

  for (let index = 0; index < 3; index++) {
    view.rerender(<RouterProvider router={router} />)
  }
  await act(() => router.invalidate())
  await act(() => router.navigate({ to: '/parent/b' }))
  expect(screen.getByText('Child B')).toBeInTheDocument()
  await act(() => router.navigate({ to: '/parent/a' }))
  expect(screen.getByText('Child A')).toBeInTheDocument()
  expect(rootRender).toHaveBeenCalledTimes(rootCalls)
  expect(layoutRender).toHaveBeenCalledTimes(layoutCalls)
})

test('replacing router context updates route consumers while preserving ordinary layout rendering and child state', async () => {
  const layoutRender = vi.fn()
  const root = createRootRouteWithContext<{ label: string }>()({
    component: function Layout() {
      layoutRender()
      return <Outlet />
    },
  })
  const child = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: function Child() {
      const router = useRouter()
      const [count, setCount] = React.useState(0)
      return (
        <button onClick={() => setCount(count + 1)}>
          {router.options.context.label}: {count}
        </button>
      )
    },
  })
  const routeTree = root.addChildren([child])
  const first = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { label: 'First' },
  })
  const second = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { label: 'Second' },
  })
  await first.load()
  await second.load()
  const view = render(<RouterProvider router={first} />)
  await screen.findByRole('button', { name: 'First: 0' })
  act(() => screen.getByRole('button').click())
  const button = screen.getByRole('button')
  const layoutCalls = layoutRender.mock.calls.length

  view.rerender(<RouterProvider router={second} />)
  expect(await screen.findByRole('button', { name: 'Second: 1' })).toBe(button)
  expect(layoutRender).toHaveBeenCalledTimes(layoutCalls)
})
