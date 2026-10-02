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
  useLinkProps,
} from '../src'
import type { AnyRouter } from '../src'

afterEach(cleanup)

test('changing only replace preserves a queued intent preload for the same destination', async () => {
  let preloads = 0
  function Navigation() {
    const [replace, setReplace] = React.useState(false)
    return (
      <>
        <button onClick={() => setReplace(true)}>Enable replace</button>
        <Link to="/target" preload="intent" preloadDelay={50} replace={replace}>
          target
        </Link>
        <Outlet />
      </>
    )
  }
  const root = createRootRoute({ component: Navigation })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>source content</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    beforeLoad: ({ preload }) => {
      if (preload) {
        preloads++
      }
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('source content')
  const link = screen.getByRole('link', { name: 'target' })
  vi.useFakeTimers()
  try {
    fireEvent.mouseEnter(link)
    fireEvent.click(screen.getByText('Enable replace'))
    expect(screen.getByRole('link', { name: 'target' })).toBe(link)
    expect(link.getAttribute('href')).toBe('/target')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(preloads).toBe(1)
    expect(router.state.location.pathname).toBe('/source')
  } finally {
    vi.useRealTimers()
  }
})

test('frozen caller options keep current replace controls when enabled and then omitted', async () => {
  const borrowed: Array<object> = []
  let loads = 0
  function Navigation() {
    const [replace, setReplace] = React.useState<boolean | undefined>(false)
    const options = Object.freeze({
      to: '/target',
      preload: 'intent' as const,
      ...(replace === undefined ? {} : { replace }),
    })
    borrowed.push(options)
    const props = useLinkProps<AnyRouter, string, string>(options)
    return (
      <>
        <button onClick={() => setReplace(true)}>Enable replace</button>
        <button onClick={() => setReplace(undefined)}>Omit replace</button>
        <a {...props} data-testid="destination">
          target
        </a>
        <Outlet />
      </>
    )
  }
  const root = createRootRoute({ component: Navigation })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>source content</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    loader: () => ++loads,
    component: () => <div>target content</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('destination')
  fireEvent.focus(link)
  await waitFor(() => expect(loads).toBeGreaterThan(0))

  async function clickTarget() {
    fireEvent.click(screen.getByTestId('destination'))
    await screen.findByText('target content')
    expect(router.state.location.pathname).toBe('/target')
  }
  const initialLength = router.history.length
  await clickTarget()
  expect(router.history.length).toBe(initialLength + 1)
  await act(async () => {
    await router.navigate({ to: '/source' })
  })
  fireEvent.click(screen.getByText('Enable replace'))
  const beforeReplace = router.history.length
  await clickTarget()
  expect(router.history.length).toBe(beforeReplace)
  await act(async () => {
    await router.navigate({ to: '/source' })
  })
  fireEvent.click(screen.getByText('Omit replace'))
  const beforePush = router.history.length
  await clickTarget()
  expect(router.history.length).toBe(beforePush + 1)
  for (const options of borrowed) {
    expect(Object.isFrozen(options)).toBe(true)
    expect(options).not.toHaveProperty('_fromLocation')
    expect(options).not.toHaveProperty('_includeValidateSearch')
    expect(options).not.toHaveProperty('_isNavigate')
  }
})

test('a rendered and preloaded destination still commits search validation defaults on click', async () => {
  const preloads: Array<unknown> = []
  const options = Object.freeze({
    to: '/target',
    search: Object.freeze({}),
    preload: 'intent' as const,
  })
  function Navigation() {
    const props = useLinkProps<AnyRouter, string, string>(options)
    return (
      <>
        <a {...props} data-testid="destination">
          target
        </a>
        <Outlet />
      </>
    )
  }
  const root = createRootRoute({
    validateSearch: (search) => ({ step: Number(search.step ?? 1) }),
    component: Navigation,
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>source content</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    validateSearch: (search) => ({ page: Number(search.page ?? 2) }),
    loaderDeps: ({ search }) => search,
    loader: ({ deps, preload }) => {
      if (preload) {
        preloads.push(deps)
      }
    },
    component: () => <div>target content</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source?step=1'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('destination')
  expect(link.getAttribute('href')).toBe('/target')
  fireEvent.focus(link)
  await waitFor(() => expect(preloads).toEqual([{ step: 1, page: 2 }]))
  expect(link.getAttribute('href')).toBe('/target')
  fireEvent.click(link)
  await screen.findByText('target content')
  expect(router.state.location.search).toEqual({ step: 1, page: 2 })
  const committed = new URLSearchParams(router.history.location.search)
  expect(committed.get('step')).toBe('1')
  expect(committed.get('page')).toBe('2')
  expect(options).not.toHaveProperty('_fromLocation')
  expect(options).not.toHaveProperty('_includeValidateSearch')
})
