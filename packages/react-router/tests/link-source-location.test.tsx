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

test.each([true, false])(
  'renders, preloads and clicks the same destination after navigation (inherited: %s)',
  async (inherited) => {
    const loads = vi.fn()
    const root = createRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        page: Number(search.page ?? 0),
      }),
      component: () => (
        <>
          <Link
            to="/posts/$id/edit"
            params={inherited ? true : { id: 'fixed' }}
            search={inherited ? true : { page: 7 }}
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
    })
    const edit = createRoute({
      getParentRoute: () => posts,
      path: '/edit',
      loaderDeps: ({ search }) => ({ page: search.page }),
      loader: ({ params, deps }) => {
        loads(params.id, deps.page)
        return null
      },
    })
    const router = createRouter({
      routeTree: root.addChildren([posts.addChildren([edit])]),
      history: createMemoryHistory({
        initialEntries: ['/posts/current?page=1'],
      }),
      defaultHashScrollIntoView: false,
    })
    try {
      render(<RouterProvider router={router} />)
      const anchor = await screen.findByRole('link', { name: 'Target' })
      expect(anchor).toHaveAttribute(
        'href',
        inherited ? '/posts/current/edit?page=1' : '/posts/fixed/edit?page=7',
      )
      await act(() =>
        router.navigate({
          to: '/posts/$id',
          params: { id: 'other' },
          search: { page: 3 },
        }),
      )
      expect(screen.getByRole('link', { name: 'Target' })).toBe(anchor)
      const target = inherited
        ? '/posts/other/edit?page=3'
        : '/posts/fixed/edit?page=7'
      expect(anchor).toHaveAttribute('href', target)
      loads.mockClear()
      fireEvent.mouseEnter(anchor)
      await waitFor(() =>
        expect(loads).toHaveBeenCalledWith(
          inherited ? 'other' : 'fixed',
          inherited ? 3 : 7,
        ),
      )
      fireEvent.click(anchor)
      await waitFor(() => expect(router.state.location.href).toBe(target))
      expect(anchor).toHaveAttribute('data-status', 'active')
    } finally {
      cleanup()
      router.history.destroy()
    }
  },
)

test.each(['href', 'reloadDocument', 'publicHref'] as const)(
  'updates %s when a hook caller reuses its options object',
  (key) => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    })
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
    const options = {
      to: '/target',
      href: '/first',
      publicHref: '/public-first',
      reloadDocument: false,
    }
    function CustomLink() {
      return <a {...useLinkProps(options)}>Target</a>
    }
    const content = (
      <RouterContextProvider router={router}>
        <CustomLink />
      </RouterContextProvider>
    )
    try {
      const view = render(content)
      if (key === 'reloadDocument') {
        options.reloadDocument = true
      } else {
        options[key] = '/second'
      }
      view.rerender(
        <RouterContextProvider router={router}>
          <CustomLink />
        </RouterContextProvider>,
      )
      const anchor = screen.getByRole('link', { name: 'Target' })
      if (key === 'href') {
        expect(anchor).toHaveAttribute('href', '/second')
      }
      fireEvent.click(anchor)
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          [key]: options[key],
        }),
      )
    } finally {
      cleanup()
      navigate.mockRestore()
      router.history.destroy()
    }
  },
)
