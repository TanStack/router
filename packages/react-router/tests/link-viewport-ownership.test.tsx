import * as React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

import { getIntersectionObserverMock } from './utils'

const observe = vi.fn()
const disconnect = vi.fn()
let observerCallback: IntersectionObserverCallback

beforeEach(() => {
  observe.mockClear()
  disconnect.mockClear()
  vi.stubGlobal(
    'IntersectionObserver',
    getIntersectionObserverMock({
      observe,
      disconnect,
      onCreate: (callback) => {
        observerCallback = callback
      },
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function enterViewport(link: Element, callback = observerCallback) {
  callback(
    [{ isIntersecting: true, target: link } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  )
}

test.each([false, true])(
  'a queued viewport preload survives an abandoned destination render and retained source update with replace=%s',
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
              preload="viewport"
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
      const committedObserver = observerCallback
      const disconnects = disconnect.mock.calls.length
      act(() => enterViewport(link, committedObserver))
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
      // The original queued viewport preload uses the original target and the latest
      // committed presentation source, not either earlier/speculative source.
      expect(preloads).toEqual([{ route: 'target', id: 'first', page: 2 }])
      expect(observerCallback).toBe(committedObserver)
      expect(disconnect).toHaveBeenCalledTimes(disconnects)
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

function presentationFixture(
  preload: 'intent' | 'viewport',
  presentation: 'activeOptions' | 'disabled',
) {
  const preloads: Array<number> = []
  function Navigation() {
    const [changed, setChanged] = React.useState(false)
    const [disabled, setDisabled] = React.useState(false)
    return (
      <>
        <button onClick={() => setChanged(true)}>Change presentation</button>
        <button onClick={() => setDisabled(true)}>Disable destination</button>
        <button onClick={() => setDisabled(false)}>Enable destination</button>
        <Link
          to="/target"
          search={true}
          preload={preload}
          preloadDelay={50}
          activeOptions={
            presentation === 'activeOptions'
              ? { includeSearch: !changed }
              : undefined
          }
          disabled={
            disabled
              ? true
              : presentation === 'disabled' && !changed
                ? false
                : undefined
          }
          data-testid="destination"
        >
          destination
        </Link>
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
    path: '/target',
    beforeLoad: ({ search, preload: isPreload }) => {
      if (isPreload) {
        preloads.push(search.page)
      }
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source?page=1'] }),
  })
  return { router, preloads }
}

test.each([
  { preload: 'intent', presentation: 'activeOptions' },
  { preload: 'viewport', presentation: 'activeOptions' },
  { preload: 'intent', presentation: 'disabled' },
  { preload: 'viewport', presentation: 'disabled' },
] as const)(
  'a queued $preload preload survives $presentation changes and reads the advanced source',
  async ({ preload, presentation }) => {
    const { router, preloads } = presentationFixture(preload, presentation)
    render(<RouterProvider router={router} />)
    await screen.findByText('source content')
    const link = screen.getByTestId('destination')
    const initialObserver = observerCallback
    const observations = observe.mock.calls.length
    const disconnections = disconnect.mock.calls.length
    expect(link.getAttribute('href')).toBe('/target?page=1')

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    act(() => {
      if (preload === 'viewport') {
        enterViewport(link, initialObserver)
      } else {
        fireEvent.mouseEnter(link)
      }
      fireEvent.click(screen.getByText('Change presentation'))
    })
    await act(async () => {
      const navigation = router.navigate({
        to: '/source',
        search: { page: 2 },
        replace: true,
      })
      await vi.advanceTimersByTimeAsync(0)
      await navigation
    })
    expect(screen.getByTestId('destination')).toBe(link)
    expect(link.getAttribute('href')).toBe('/target?page=2')
    expect(link.getAttribute('aria-disabled')).toBeNull()
    if (preload === 'viewport') {
      expect(observerCallback).toBe(initialObserver)
      expect(observe).toHaveBeenCalledTimes(observations)
      expect(disconnect).toHaveBeenCalledTimes(disconnections)
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(49)
    })
    expect(preloads).toEqual([])
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(preloads).toEqual([2])
    expect(router.state.location.href).toBe('/source?page=2')

    if (preload === 'viewport') {
      // An already-queued browser notification still owns the preserved
      // observer. It schedules again and reads the next source at fire time.
      act(() => enterViewport(link, initialObserver))
      await act(async () => {
        const navigation = router.navigate({
          to: '/source',
          search: { page: 3 },
          replace: true,
        })
        await vi.advanceTimersByTimeAsync(0)
        await navigation
        await vi.advanceTimersByTimeAsync(50)
      })
      expect(preloads).toEqual([2, 3])
      expect(screen.getByTestId('destination')).toBe(link)
      expect(link.getAttribute('href')).toBe('/target?page=3')
    }
  },
)

test.each(['intent', 'viewport'] as const)(
  'disabling a destination cancels its queued %s preload and ignores a retired observer',
  async (preload) => {
    const { router, preloads } = presentationFixture(preload, 'disabled')
    render(<RouterProvider router={router} />)
    await screen.findByText('source content')
    const link = screen.getByTestId('destination')
    const initialObserver = observerCallback
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    act(() => {
      if (preload === 'viewport') {
        enterViewport(link, initialObserver)
      } else {
        fireEvent.mouseEnter(link)
      }
      fireEvent.click(screen.getByText('Disable destination'))
    })
    expect(screen.getByTestId('destination')).toBe(link)
    expect(link.getAttribute('href')).toBeNull()
    expect(link.getAttribute('aria-disabled')).toBe('true')
    if (preload === 'viewport') {
      act(() => enterViewport(link, initialObserver))
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
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
    act(() => {
      fireEvent.click(screen.getByText('Enable destination'))
    })
    if (preload === 'viewport') {
      expect(observerCallback).not.toBe(initialObserver)
      act(() => enterViewport(link))
    } else {
      fireEvent.mouseEnter(link)
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(preloads).toEqual([2])
    expect(link.getAttribute('href')).toBe('/target?page=2')
    expect(router.state.location.href).toBe('/source?page=2')
  },
)
