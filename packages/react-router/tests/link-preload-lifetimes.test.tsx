import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function setup() {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren(
      (['/home', '/first', '/second'] as const).map((path) =>
        createRoute({ getParentRoute: () => root, path }),
      ),
    ),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
  })
  await router.load()
  return router
}

test('unmounting one Link cancels only its pending intent preload and remounting can preload again', async () => {
  const router = await setup()
  const preload = vi.spyOn(router, 'preloadRoute').mockResolvedValue(undefined)
  vi.useFakeTimers()

  const content = (showFirst: boolean) => (
    <React.StrictMode>
      <RouterContextProvider router={router}>
        {showFirst ? (
          <Link key="first" to="/first" preload="intent" preloadDelay={50}>
            First target
          </Link>
        ) : null}
        <Link key="second" to="/second" preload="intent" preloadDelay={50}>
          Second target
        </Link>
      </RouterContextProvider>
    </React.StrictMode>
  )
  const view = render(content(true))
  const second = screen.getByRole('link', { name: 'Second target' })
  fireEvent.mouseEnter(screen.getByRole('link', { name: 'First target' }))
  fireEvent.mouseEnter(second)
  act(() => vi.advanceTimersByTime(20))

  view.rerender(content(false))
  expect(screen.queryByRole('link', { name: 'First target' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Second target' })).toBe(second)
  act(() => vi.advanceTimersByTime(30))
  expect(preload).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ to: '/second' }),
  )

  view.rerender(content(true))
  fireEvent.mouseEnter(screen.getByRole('link', { name: 'First target' }))
  act(() => vi.advanceTimersByTime(49))
  expect(preload).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(1))
  expect(preload).toHaveBeenCalledTimes(2)
  expect(preload).toHaveBeenLastCalledWith(
    expect.objectContaining({ to: '/first' }),
  )
})

test('replacing the router cancels pending intent preload and new intent uses the replacement', async () => {
  const first = await setup()
  const second = await setup()
  const firstPreload = vi
    .spyOn(first, 'preloadRoute')
    .mockResolvedValue(undefined)
  const secondPreload = vi
    .spyOn(second, 'preloadRoute')
    .mockResolvedValue(undefined)
  vi.useFakeTimers()

  const content = (router: typeof first) => (
    <RouterContextProvider router={router}>
      <Link to="/first" preload="intent" preloadDelay={50}>
        Target
      </Link>
    </RouterContextProvider>
  )
  const view = render(content(first))
  const link = screen.getByRole('link', { name: 'Target' })
  fireEvent.mouseEnter(link)
  act(() => vi.advanceTimersByTime(20))

  view.rerender(content(second))
  expect(screen.getByRole('link', { name: 'Target' })).toBe(link)
  act(() => vi.advanceTimersByTime(30))
  expect(firstPreload).not.toHaveBeenCalled()
  expect(secondPreload).not.toHaveBeenCalled()

  fireEvent.mouseLeave(link)
  fireEvent.mouseEnter(link)
  act(() => vi.advanceTimersByTime(49))
  expect(secondPreload).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(secondPreload).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ to: '/first' }),
  )
  expect(firstPreload).not.toHaveBeenCalled()
})
