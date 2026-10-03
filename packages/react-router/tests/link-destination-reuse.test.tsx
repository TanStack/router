import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
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

describe('Link owned destination cache', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllEnvs()
  })

  test('a fixed Link reuses its rendered destination for intent and validated click without mutating caller options', async () => {
    let outputCalls = 0
    let preloads = 0
    const options = Object.freeze({
      to: '/target/$id',
      params: Object.freeze({ id: 'first' }),
      search: Object.freeze({}),
      preload: 'intent' as const,
      preloadDelay: 0,
    })
    function Navigation() {
      const props = useLinkProps<AnyRouter, string, string>(options)
      return (
        <>
          <a {...props}>target</a>
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
      path: '/target/$id',
      beforeLoad: ({ preload }) => {
        if (preload) {
          preloads++
        }
      },
      component: () => <div>target content</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([source, target]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      rewrite: {
        output: ({ url }) => {
          if (url.pathname === '/target/first') {
            outputCalls++
          }
          return url
        },
      },
    })
    render(<RouterProvider router={router} />)
    await screen.findByText('source content')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    const link = screen.getByRole('link', { name: 'target' })
    expect(link.getAttribute('href')).toBe('/target/first')
    const renderedCalls = outputCalls
    expect(renderedCalls).toBeGreaterThan(0)

    fireEvent.focus(link)
    await waitFor(() => expect(preloads).toBe(1))
    expect(outputCalls).toBe(renderedCalls)
    fireEvent.click(link)
    await screen.findByText('target content')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(router.state.location.pathname).toBe('/target/first')
    expect(outputCalls).toBe(renderedCalls)
    expect(options).not.toHaveProperty('_buildCache')
    expect(options).not.toHaveProperty('_fromLocation')
    expect(options).not.toHaveProperty('_includeValidateSearch')
    expect(options).not.toHaveProperty('_isNavigate')
  })

  test('document navigation rebuilds the transformed destination when Link has both href and to', async () => {
    const outputPaths: Array<string> = []
    const options = Object.freeze({
      to: '/target',
      href: '/alias',
      reloadDocument: true,
    })
    function Navigation() {
      const props = useLinkProps<AnyRouter, string, string>(options)
      return (
        <>
          <a {...props}>target</a>
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
    const target = createRoute({ getParentRoute: () => root, path: '/target' })
    const alias = createRoute({ getParentRoute: () => root, path: '/alias' })
    const history = createMemoryHistory({ initialEntries: ['/source'] })
    const blockerFn = vi.fn(() => true)
    const unblock = history.block({ blockerFn })
    const router = createRouter({
      routeTree: root.addChildren([source, target, alias]),
      history,
      rewrite: {
        output: ({ url }) => {
          outputPaths.push(url.pathname)
          const rewritten = new URL(url)
          rewritten.pathname = `/public${url.pathname}`
          return rewritten
        },
      },
    })
    try {
      render(<RouterProvider router={router} />)
      await screen.findByText('source content')
      await waitFor(() => expect(router.state.status).toBe('idle'))
      const link = screen.getByRole('link', { name: 'target' })
      expect(link.getAttribute('href')).toBe('/public/alias')
      outputPaths.length = 0
      fireEvent.click(link)
      await waitFor(() => expect(blockerFn).toHaveBeenCalledTimes(1))
      expect(outputPaths).toContain('/target')
      expect(history.location.pathname).toBe('/source')
      expect(options).not.toHaveProperty('_buildCache')
      expect(options).not.toHaveProperty('_fromLocation')
    } finally {
      unblock()
    }
  })

  test('a Link does not install a result built across a reentrant configuration update', async () => {
    let update = true
    function Navigation() {
      return (
        <>
          <Link to="/target" search={{ linkMarker: 'fixed' }}>
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
    const target = createRoute({ getParentRoute: () => root, path: '/target' })
    const router: AnyRouter = createRouter({
      routeTree: root.addChildren([source, target]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
      stringifySearch: (search) => {
        if (update && search.linkMarker === 'fixed') {
          update = false
          router.update({ trailingSlash: 'always' })
        }
        return defaultStringifySearch(search)
      },
    })
    render(<RouterProvider router={router} />)
    await screen.findByText('source content')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    const link = screen.getByRole('link', { name: 'target' })
    expect(link.getAttribute('href')).toBe('/target?linkMarker=fixed')
    expect(router.options.trailingSlash).toBe('always')

    await act(async () => {
      await router.navigate({ to: '/source', search: { revision: 1 } })
    })
    expect(screen.getByRole('link', { name: 'target' })).toBe(link)
    expect(link.getAttribute('href')).toBe('/target/?linkMarker=fixed')
  })
})

test.each(['static', 'validation'] as const)(
  'a fixed %s Link preloads again after a click and retained source updates',
  async (kind) => {
    let validationCalls = 0
    const preloads: Array<string> = []
    const params = { id: 'fixed' }
    const search = {}
    function Navigation() {
      return (
        <>
          <Link
            to="/target/$id"
            params={params}
            search={search}
            preload="intent"
            data-testid="fixed-destination"
          >
            fixed destination
          </Link>
          <Outlet />
        </>
      )
    }
    const root = createRootRoute({ component: Navigation })
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source/$revision',
      component: () => <div>source content</div>,
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target/$id',
      ...(kind === 'validation'
        ? {
            validateSearch: (search: Record<string, unknown>) => {
              validationCalls++
              return { page: Number(search.page ?? 2) }
            },
          }
        : {}),
      loader: ({ location, preload }) => {
        if (preload) {
          preloads.push(location.href)
        }
      },
      staleTime: 0,
      preloadStaleTime: 0,
      component: () => <div>target content</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([source, target]),
      history: createMemoryHistory({ initialEntries: ['/source/one'] }),
    })
    render(<RouterProvider router={router} />)
    await screen.findByText('source content')
    const link = screen.getByTestId('fixed-destination')
    expect(link.getAttribute('href')).toBe('/target/fixed')
    fireEvent.focus(link)
    await waitFor(() => expect(preloads).toEqual(['/target/fixed']))

    const beforeClick = router.history.length
    const beforeValidation = validationCalls
    fireEvent.click(link)
    await screen.findByText('target content')
    expect(router.state.location.href).toBe(
      kind === 'validation' ? '/target/fixed?page=2' : '/target/fixed',
    )
    if (kind === 'validation') {
      expect(validationCalls).toBeGreaterThan(beforeValidation)
      expect(router.state.location.search).toEqual({ page: 2 })
    }
    expect(router.history.length).toBe(beforeClick + 1)
    expect(screen.getByTestId('fixed-destination')).toBe(link)

    await act(async () => {
      await router.navigate({
        to: '/source/$revision',
        params: { revision: 'two' },
      })
      await router.navigate({
        to: '/source/$revision',
        params: { revision: 'three' },
        replace: true,
      })
    })
    expect(router.state.location.href).toBe('/source/three')
    expect(screen.getByTestId('fixed-destination')).toBe(link)
    expect(link.getAttribute('href')).toBe('/target/fixed')
    fireEvent.focus(link)
    await waitFor(() => {
      expect(preloads).toEqual(['/target/fixed', '/target/fixed'])
    })
    expect(router.state.location.href).toBe('/source/three')
    expect(screen.getByTestId('fixed-destination')).toBe(link)
    expect(link.getAttribute('href')).toBe('/target/fixed')
  },
)
