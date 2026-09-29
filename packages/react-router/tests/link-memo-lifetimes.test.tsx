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
})

async function setup(targetLoader?: () => void, nextTargetLoader?: () => void) {
  const root = createRootRoute()
  const source = createRoute({ getParentRoute: () => root, path: '/a' })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/b',
    loader: targetLoader,
  })
  const nextTarget = createRoute({
    getParentRoute: () => root,
    path: '/c',
    loader: nextTargetLoader,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target, nextTarget]),
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  })
  await router.load()
  return router
}

test('changing only active options preserves an already scheduled intent preload', async () => {
  const targetLoader = vi.fn()
  const router = await setup(targetLoader)
  vi.useFakeTimers()
  function Example() {
    const [exact, setExact] = React.useState(false)
    return (
      <>
        <button onClick={() => setExact(true)}>Change active options</button>
        <Link
          to="/b"
          activeOptions={{ exact }}
          preload="intent"
          preloadDelay={50}
        >
          Target
        </Link>
      </>
    )
  }
  render(
    <RouterContextProvider router={router}>
      <Example />
    </RouterContextProvider>,
  )
  fireEvent.mouseOver(screen.getByRole('link', { name: 'Target' }))
  await act(() => vi.advanceTimersByTimeAsync(20))
  fireEvent.click(screen.getByRole('button', { name: 'Change active options' }))
  expect(targetLoader).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(30))
  expect(targetLoader).toHaveBeenCalledTimes(1)
})

test('changing reloadDocument affects the next click without changing the destination', async () => {
  const router = await setup()
  const blockedTargets: Array<string> = []
  const unblock = router.history.block({
    blockerFn: ({ nextLocation }) => {
      blockedTargets.push(nextLocation.pathname)
      return true
    },
  })
  function Example() {
    const [reload, setReload] = React.useState(false)
    return (
      <>
        <button onClick={() => setReload(true)}>Enable document reload</button>
        <Link to="/b" reloadDocument={reload}>
          Target
        </Link>
      </>
    )
  }
  render(
    <RouterContextProvider router={router}>
      <Example />
    </RouterContextProvider>,
  )
  try {
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable document reload' }),
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('link', { name: 'Target' }))
    })
    // Document navigation exposes the current history location to blockers;
    // an SPA navigation would instead expose the pending /b location.
    expect(blockedTargets).toEqual(['/a'])
    expect(router.history.location.pathname).toBe('/a')
  } finally {
    unblock()
  }
})

test('changing href updates the displayed target and activity', async () => {
  const router = await setup()
  function Example() {
    const [changed, setChanged] = React.useState(false)
    return (
      <>
        <button onClick={() => setChanged(true)}>Change href</button>
        <Link to="/a" href={changed ? '/b' : '/a'}>
          Target
        </Link>
      </>
    )
  }
  render(
    <RouterContextProvider router={router}>
      <Example />
    </RouterContextProvider>,
  )
  const link = screen.getByRole('link', { name: 'Target' })
  expect(link).toHaveAttribute('href', '/a')
  expect(link).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: 'Change href' }))
  expect(link).toHaveAttribute('href', '/b')
  expect(link).not.toHaveAttribute('aria-current')
})

test('changing href cancels old intent work and preloads and navigates to the current target', async () => {
  const oldLoader = vi.fn()
  const currentLoader = vi.fn()
  const router = await setup(oldLoader, currentLoader)
  vi.useFakeTimers()
  function Example() {
    const [href, setHref] = React.useState('/b')
    return (
      <>
        <button onClick={() => setHref('/c')}>Retarget href</button>
        <Link to="/a" href={href} preload="intent" preloadDelay={50}>
          Current target
        </Link>
      </>
    )
  }
  render(
    <RouterContextProvider router={router}>
      <Example />
    </RouterContextProvider>,
  )
  const link = screen.getByRole('link', { name: 'Current target' })
  expect(link).toHaveAttribute('href', '/b')
  fireEvent.mouseOver(link)
  await act(() => vi.advanceTimersByTimeAsync(20))
  fireEvent.click(screen.getByRole('button', { name: 'Retarget href' }))
  expect(link).toHaveAttribute('href', '/c')
  await act(() => vi.advanceTimersByTimeAsync(100))
  expect(oldLoader).not.toHaveBeenCalled()
  expect(currentLoader).not.toHaveBeenCalled()

  fireEvent.mouseLeave(link)
  fireEvent.mouseOver(link)
  await act(() => vi.advanceTimersByTimeAsync(50))
  expect(oldLoader).not.toHaveBeenCalled()
  expect(currentLoader).toHaveBeenCalledTimes(1)
  expect(router.state.location.pathname).toBe('/a')

  await act(async () => {
    fireEvent.click(link)
  })
  expect(router.state.location.pathname).toBe('/c')
  expect(router.history.location.pathname).toBe('/c')
  expect(link).toHaveAttribute('href', '/c')
  expect(link).toHaveAttribute('aria-current', 'page')
  expect(oldLoader).not.toHaveBeenCalled()
})
