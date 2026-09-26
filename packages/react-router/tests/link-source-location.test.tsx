import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterContextProvider,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '../src'

test('updates destinations when a hook caller reuses its options object', () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const options = { to: '/one', search: {}, hash: 'first' }
  try {
    const { result, rerender } = renderHook(() => useLinkProps(options), {
      wrapper: ({ children }) => (
        <RouterContextProvider router={router}>
          {children}
        </RouterContextProvider>
      ),
    })
    expect(result.current.href).toBe('/one#first')
    options.to = '/two'
    rerender()
    expect(result.current.href).toBe('/two#first')
    options.hash = 'second'
    rerender()
    expect(result.current.href).toBe('/two#second')
  } finally {
    cleanup()
    router.history.destroy()
  }
})

test('keeps an explicit source through rendering, navigation, preloading and clicking', async () => {
  const loads = vi.fn()
  const root = createRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      page: Number(search.page ?? 0),
    }),
    component: () => (
      <>
        <Link
          to="/posts/$id"
          params={true}
          search={true}
          _fromLocation={source}
          preload="intent"
          preloadDelay={0}
        >
          Target
        </Link>
        <Outlet />
      </>
    ),
  })
  const posts = createRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
    loaderDeps: ({ search }) => ({ page: search.page }),
    loader: ({ params, deps }) => {
      loads(params.id, deps.page)
      return null
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([posts]),
    history: createMemoryHistory({ initialEntries: ['/posts/current?page=1'] }),
    defaultHashScrollIntoView: false,
  })
  const source = router.buildLocation({
    to: '/posts/$id',
    params: { id: 'source' },
    search: { page: 2 },
  })
  try {
    render(<RouterProvider router={router} />)
    const anchor = await screen.findByRole('link', { name: 'Target' })
    expect(anchor).toHaveAttribute('href', '/posts/source?page=2')
    await act(() =>
      router.navigate({
        to: '/posts/$id',
        params: { id: 'other' },
        search: { page: 3 },
      }),
    )
    expect(screen.getByRole('link', { name: 'Target' })).toBe(anchor)
    expect(anchor).toHaveAttribute('href', '/posts/source?page=2')
    loads.mockClear()
    fireEvent.mouseEnter(anchor)
    await waitFor(() => expect(loads).toHaveBeenCalledWith('source', 2))
    fireEvent.click(anchor)
    await waitFor(() =>
      expect(router.state.location.href).toBe('/posts/source?page=2'),
    )
    expect(anchor).toHaveAttribute('data-status', 'active')
  } finally {
    cleanup()
    router.history.destroy()
  }
})
