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

test.each([false, true])(
  'a suspended Link update preserves the visible destination and replace=%s until commit',
  async (initialReplace) => {
    let release!: () => void
    let released = false
    let speculativeAttempts = 0
    const gate = new Promise<void>((resolve) => {
      release = () => {
        released = true
        resolve()
      }
    })
    const preloads: Array<{ id: string; page: number }> = []

    function SuspendUpdate({ pending }: { pending: boolean }) {
      if (pending && !released) {
        speculativeAttempts++
        throw gate
      }
      return null
    }

    function Navigation() {
      const [pending, setPending] = React.useState(false)
      return (
        <>
          <button
            onClick={() => {
              React.startTransition(() => {
                setPending(true)
              })
            }}
          >
            Change destination
          </button>
          <React.Suspense fallback={<div>Updating destination</div>}>
            <Link
              to={pending ? '/other/$id' : '/target/$id'}
              params={{ id: pending ? 'second' : 'first' }}
              search={{ page: pending ? 2 : 1 }}
              replace={pending ? !initialReplace : initialReplace}
              preload="intent"
              preloadDelay={0}
              data-testid="destination"
            >
              destination
            </Link>
            <SuspendUpdate pending={pending} />
          </React.Suspense>
          <Outlet />
        </>
      )
    }

    const root = createRootRoute({
      validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
      component: Navigation,
    })
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source',
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target/$id',
      loaderDeps: ({ search }) => ({ page: search.page }),
      loader: ({ params, deps, preload }) => {
        if (preload) {
          preloads.push({ id: params.id, page: deps.page })
        }
      },
      component: () => <div>target content</div>,
    })
    const other = createRoute({
      getParentRoute: () => root,
      path: '/other/$id',
      component: () => <div>other content</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([source, target, other]),
      history: createMemoryHistory({ initialEntries: ['/source'] }),
    })

    try {
      render(<RouterProvider router={router} />)
      const link = await screen.findByTestId('destination')
      expect(link.getAttribute('href')).toBe('/target/first?page=1')

      await act(async () => {
        fireEvent.click(screen.getByText('Change destination'))
      })
      // The Link renders before its sibling suspends, so this verifies that
      // speculative Link work ran while its previous element stayed visible.
      expect(speculativeAttempts).toBeGreaterThan(0)
      expect(screen.queryByText('Updating destination')).toBeNull()
      expect(screen.getByTestId('destination')).toBe(link)
      expect(link.getAttribute('href')).toBe('/target/first?page=1')

      fireEvent.focus(link)
      await waitFor(() => {
        expect(preloads).toEqual([{ id: 'first', page: 1 }])
      })
      const beforeCommittedClick = router.history.length
      fireEvent.click(link)
      await screen.findByText('target content')
      expect(router.state.location.href).toBe('/target/first?page=1')
      expect(router.history.length).toBe(
        beforeCommittedClick + (initialReplace ? 0 : 1),
      )
      expect(link.getAttribute('href')).toBe('/target/first?page=1')
      expect(screen.queryByText('Updating destination')).toBeNull()

      await act(async () => {
        release()
        await gate
      })
      await waitFor(() => {
        expect(screen.getByTestId('destination')).toBe(link)
        expect(link.getAttribute('href')).toBe('/other/second?page=2')
      })
      const beforeUpdatedClick = router.history.length
      fireEvent.click(link)
      await screen.findByText('other content')
      expect(router.state.location.href).toBe('/other/second?page=2')
      expect(router.history.length).toBe(
        beforeUpdatedClick + (initialReplace ? 1 : 0),
      )
    } finally {
      await act(async () => {
        release()
        await gate
      })
    }
  },
)

test.each([false, true])(
  'a queued intent survives an abandoned destination render and retained source update with replace=%s',
  async (initialReplace) => {
    let release!: () => void
    let released = false
    let speculativeAttempts = 0
    const gate = new Promise<void>((resolve) => {
      release = () => {
        released = true
        resolve()
      }
    })
    const preloads: Array<{ route: string; id: string; page: number }> = []
    const committedParams = { id: 'first' }
    const speculativeParams = { id: 'second' }
    const committedSearch = (previous: { page: number }) => ({
      page: previous.page,
    })
    const speculativeSearch = () => ({ page: 999 })

    function SuspendUpdate({ pending }: { pending: boolean }) {
      if (pending && !released) {
        speculativeAttempts++
        throw gate
      }
      return null
    }

    function Navigation() {
      const [pending, setPending] = React.useState(false)
      return (
        <>
          <button
            onClick={() => {
              React.startTransition(() => {
                setPending(true)
              })
            }}
          >
            Change destination
          </button>
          <button onClick={() => setPending(false)}>Abandon destination</button>
          <React.Suspense fallback={<div>Updating destination</div>}>
            <Link
              to={pending ? '/other/$id' : '/target/$id'}
              params={pending ? speculativeParams : committedParams}
              search={pending ? speculativeSearch : committedSearch}
              replace={pending ? !initialReplace : initialReplace}
              preload="intent"
              preloadDelay={50}
              data-testid="destination"
            >
              destination
            </Link>
            <SuspendUpdate pending={pending} />
          </React.Suspense>
          <Outlet />
        </>
      )
    }

    const root = createRootRoute({
      validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
      component: Navigation,
    })
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source',
      component: () => <div>source content</div>,
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target/$id',
      loaderDeps: ({ search }) => ({ page: search.page }),
      loader: ({ params, deps, preload }) => {
        if (preload) {
          preloads.push({ route: 'target', id: params.id, page: deps.page })
        }
      },
      component: () => <div>target content</div>,
    })
    const other = createRoute({
      getParentRoute: () => root,
      path: '/other/$id',
      loaderDeps: ({ search }) => ({ page: search.page }),
      loader: ({ params, deps, preload }) => {
        if (preload) {
          preloads.push({ route: 'other', id: params.id, page: deps.page })
        }
      },
      component: () => <div>other content</div>,
    })
    const router = createRouter({
      routeTree: root.addChildren([source, target, other]),
      history: createMemoryHistory({ initialEntries: ['/source?page=1'] }),
    })

    try {
      render(<RouterProvider router={router} />)
      await screen.findByText('source content')
      const link = screen.getByTestId('destination')
      expect(link.getAttribute('href')).toBe('/target/first?page=1')

      // Only intent timers are virtualized; React's scheduling stays real.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      fireEvent.mouseEnter(link)
      await act(async () => {
        fireEvent.click(screen.getByText('Change destination'))
      })
      // The Link precedes its suspending sibling, proving its alternate
      // destination and controls rendered without committing to the DOM.
      expect(speculativeAttempts).toBeGreaterThan(0)
      expect(screen.queryByText('Updating destination')).toBeNull()
      expect(screen.getByTestId('destination')).toBe(link)
      expect(link.getAttribute('href')).toBe('/target/first?page=1')
      expect(preloads).toEqual([])

      await act(async () => {
        const navigation = router.navigate({
          to: '/source',
          search: { page: 2 },
          replace: true,
        })
        await vi.advanceTimersByTimeAsync(0)
        await navigation
      })
      expect(router.state.location.href).toBe('/source?page=2')
      expect(screen.getByTestId('destination')).toBe(link)
      expect(link.getAttribute('href')).toBe('/target/first?page=2')
      expect(screen.queryByText('Updating destination')).toBeNull()
      expect(preloads).toEqual([])

      // An urgent state update abandons the blocked alternate render.
      // Releasing its promise later must not commit its target or controls.
      await act(async () => {
        fireEvent.click(screen.getByText('Abandon destination'))
        release()
        await gate
      })
      expect(screen.getByTestId('destination')).toBe(link)
      expect(link.getAttribute('href')).toBe('/target/first?page=2')
      expect(screen.queryByText('Updating destination')).toBeNull()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(49)
      })
      expect(preloads).toEqual([])
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      // The original queued intent uses the original target and the latest
      // committed presentation source, not either earlier/speculative source.
      expect(preloads).toEqual([{ route: 'target', id: 'first', page: 2 }])
      expect(router.state.location.href).toBe('/source?page=2')

      vi.useRealTimers()
      const beforeClick = router.history.length
      fireEvent.click(link)
      await screen.findByText('target content')
      expect(router.state.location.href).toBe('/target/first?page=2')
      expect(router.history.length).toBe(beforeClick + (initialReplace ? 0 : 1))
      expect(screen.queryByText('other content')).toBeNull()
      expect(screen.getByTestId('destination')).toBe(link)
    } finally {
      vi.useRealTimers()
      await act(async () => {
        release()
        await gate
      })
    }
  },
)
