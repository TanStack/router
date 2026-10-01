import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  useLinkProps,
} from '../src'

afterEach(cleanup)

test.each([false, true])(
  'preserves caller click handlers across destination changes (cancel=%s)',
  (cancel) => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
      isServer: false,
      rewrite: {
        output: ({ url }) =>
          url.pathname === '/external'
            ? new URL('https://other.example/rewritten')
            : url,
      },
    })
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onClick = vi.fn((event: React.MouseEvent) => {
      if (cancel) {
        event.preventDefault()
      }
    })
    const content = (to: string) => (
      <RouterContextProvider router={router}>
        <Link to={to} onClick={onClick}>
          Target
        </Link>
      </RouterContextProvider>
    )
    try {
      const view = render(content('/safe'))
      const anchor = view.getByText('Target')
      for (const [to, internal] of [
        ['/safe', true],
        ['https://other.example/', false],
        ['/external', false],
        ['javascript:blocked()', false],
        ['/next', true],
      ] as const) {
        onClick.mockClear()
        navigate.mockClear()
        view.rerender(content(to))
        expect(view.getByText('Target')).toBe(anchor)
        let intercepted: boolean | undefined
        const preventNativeNavigation = (event: Event) => {
          intercepted = event.defaultPrevented
          event.preventDefault()
        }
        document.addEventListener('click', preventNativeNavigation)
        try {
          fireEvent.click(anchor)
        } finally {
          document.removeEventListener('click', preventNativeNavigation)
        }
        expect(onClick).toHaveBeenCalledOnce()
        expect(intercepted).toBe(cancel || internal)
        expect(navigate).toHaveBeenCalledTimes(internal && !cancel ? 1 : 0)
      }
    } finally {
      cleanup()
      navigate.mockRestore()
      warn.mockRestore()
    }
  },
)

test.each(['https://other.example/', 'javascript:blocked()'])(
  'cancels delayed internal preloads when the destination changes to %s',
  (destination) => {
    vi.useFakeTimers()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
    })
    const preload = vi
      .spyOn(router, 'preloadRoute')
      .mockResolvedValue(undefined)
    const content = (to: string) => (
      <RouterContextProvider router={router}>
        <Link to={to} preload="intent" preloadDelay={50}>
          Target
        </Link>
      </RouterContextProvider>
    )
    try {
      const view = render(content('/old'))
      fireEvent.mouseEnter(view.getByText('Target'))
      view.rerender(content(destination))
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(preload).not.toHaveBeenCalled()
      view.rerender(content('/next'))
      fireEvent.mouseEnter(view.getByText('Target'))
      act(() => {
        vi.advanceTimersByTime(100)
      })
      expect(preload).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ to: '/next' }),
      )
    } finally {
      cleanup()
      warn.mockRestore()
      vi.useRealTimers()
    }
  },
)

test.each(['onClick', 'onFocus', 'onMouseEnter', 'onTouchStart'] as const)(
  '%s respects cancellation before and after the user handler',
  (eventName) => {
    const router = createRouter({
      routeTree: createRootRoute(),
      history: createMemoryHistory(),
      isServer: false,
    })
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue()
    const preload = vi
      .spyOn(router, 'preloadRoute')
      .mockResolvedValue(undefined)
    const userHandler = vi.fn((event: React.SyntheticEvent) => {
      if (cancelInUserHandler) {
        event.preventDefault()
      }
    })
    let cancelInUserHandler = false
    const { result } = renderHook(
      () =>
        useLinkProps({
          to: '/target',
          preload: 'intent',
          preloadDelay: 0,
          [eventName]: userHandler,
        }),
      {
        wrapper: ({ children }) => (
          <RouterContextProvider router={router}>
            {children}
          </RouterContextProvider>
        ),
      },
    )
    const internalHandler = eventName === 'onClick' ? navigate : preload
    const anchor = document.createElement('a')
    for (const initiallyPrevented of [true, false]) {
      for (const cancel of [true, false]) {
        cancelInUserHandler = cancel
        userHandler.mockClear()
        internalHandler.mockClear()
        const event = {
          defaultPrevented: initiallyPrevented,
          preventDefault() {
            this.defaultPrevented = true
          },
          currentTarget: anchor,
          button: 0,
        }
        result.current[eventName]!(
          event as unknown as React.MouseEvent<HTMLAnchorElement> &
            React.TouchEvent<HTMLAnchorElement> &
            React.FocusEvent<HTMLAnchorElement>,
        )
        expect(userHandler).toHaveBeenCalledTimes(initiallyPrevented ? 0 : 1)
        expect(internalHandler).toHaveBeenCalledTimes(
          initiallyPrevented || cancel ? 0 : 1,
        )
      }
    }
  },
)

test('preserves delayed intent preloads across equivalent destination renders', () => {
  vi.useFakeTimers()
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
  })
  const preload = vi.spyOn(router, 'preloadRoute').mockResolvedValue(undefined)
  const content = (label: string) => (
    <RouterContextProvider router={router}>
      <Link
        to="/target"
        search={{ page: 1 }}
        activeOptions={{ exact: label === 'After' }}
        preload="intent"
        preloadDelay={50}
        className={label}
      >
        {label}
      </Link>
    </RouterContextProvider>
  )
  try {
    const view = render(content('Before'))
    fireEvent.mouseEnter(view.getByText('Before'))
    view.rerender(content('After'))
    act(() => vi.advanceTimersByTime(100))
    expect(preload).toHaveBeenCalledOnce()
    expect(preload).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/target', search: { page: 1 } }),
    )
  } finally {
    cleanup()
    vi.useRealTimers()
    preload.mockRestore()
  }
})

test('keeps viewport observers across equivalent destination renders', () => {
  const observe = vi.fn()
  const disconnect = vi.fn()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = observe
      disconnect = disconnect
    },
  )
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
  })
  const content = (label: string) => (
    <RouterContextProvider router={router}>
      <Link
        to="/target"
        params={{}}
        activeOptions={{ exact: label === 'After' }}
        preload="viewport"
      >
        {label}
      </Link>
    </RouterContextProvider>
  )
  try {
    const view = render(content('Before'))
    expect(observe).toHaveBeenCalledOnce()
    view.rerender(content('After'))
    expect(observe).toHaveBeenCalledOnce()
    expect(disconnect).not.toHaveBeenCalled()
    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  } finally {
    cleanup()
    vi.unstubAllGlobals()
  }
})

test('preserves committed intent preloads after a destination transition suspends', async () => {
  vi.useFakeTimers()
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
    isServer: false,
  })
  const preload = vi.spyOn(router, 'preloadRoute').mockResolvedValue(undefined)
  const pending = new Promise<never>(() => {})
  let setDestination!: React.Dispatch<React.SetStateAction<string>>
  let setLabel!: React.Dispatch<React.SetStateAction<string>>
  const suspended = vi.fn()
  function Suspend({ destination }: { destination: string }) {
    if (destination === '/pending') {
      suspended()
      throw pending
    }
    return null
  }
  function App() {
    const [destination, updateDestination] = React.useState('/target')
    const [label, updateLabel] = React.useState('Before')
    setDestination = updateDestination
    setLabel = updateLabel
    return (
      <React.Suspense fallback="Loading">
        <Link to={destination} preload="intent" preloadDelay={50}>
          {label}
        </Link>
        <Suspend destination={destination} />
      </React.Suspense>
    )
  }
  try {
    const view = render(
      <RouterContextProvider router={router}>
        <App />
      </RouterContextProvider>,
    )
    fireEvent.mouseEnter(view.getByText('Before'))
    await act(async () => {
      React.startTransition(() => setDestination('/pending'))
    })
    expect(suspended).toHaveBeenCalled()
    act(() => setLabel('After'))
    expect(view.getByText('After').getAttribute('href')).toBe('/target')
    act(() => vi.advanceTimersByTime(100))
    expect(preload).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ to: '/target' }),
    )
  } finally {
    cleanup()
    vi.useRealTimers()
    preload.mockRestore()
  }
})
