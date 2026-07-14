import { afterEach, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
} from '../src'

afterEach(() => {
  cleanup()
})

test('#6371: initial search defaults produce one live canonical loader', async () => {
  const loaderGate = createControlledPromise<string>()
  const canonicalLocation = createControlledPromise<void>()
  const abortedLoaderData = 'discarded aborted loader'
  const loaderSignals: Array<AbortSignal> = []
  const loaderLocations: Array<string> = []
  const errorComponentRendered = vi.fn()
  const loader = vi.fn(
    ({
      abortController,
      location,
    }: {
      abortController: AbortController
      location: { href: string }
    }) => {
      const signal = abortController.signal
      loaderSignals.push(signal)
      loaderLocations.push(location.href)

      return new Promise<string>((resolve, reject) => {
        const onAbort = () => {
          resolve(abortedLoaderData)
        }

        if (signal.aborted) {
          onAbort()
          return
        }

        signal.addEventListener('abort', onAbort, { once: true })
        loaderGate.then((data) => {
          signal.removeEventListener('abort', onAbort)
          resolve(data)
        }, reject)
      })
    },
  )

  const PendingLocation = () => {
    const href = useLocation({ select: (location) => location.href })
    return <div data-testid="pending-location">{href}</div>
  }

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    validateSearch: (search: Record<string, unknown>) => ({
      page: typeof search.page === 'number' ? search.page : 1,
    }),
    loader,
    component: () => (
      <div data-testid="about-data">{aboutRoute.useLoaderData()}</div>
    ),
    errorComponent: ({ error }) => {
      errorComponentRendered(error)
      return <div data-testid="about-error">{error.message}</div>
    },
  })
  const history = createMemoryHistory({ initialEntries: ['/about'] })
  const unsubscribeHistory = history.subscribe(() => {
    if (history.location.href === '/about?page=1') {
      canonicalLocation.resolve()
    }
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([aboutRoute]),
    history,
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: PendingLocation,
  })

  try {
    render(<RouterProvider router={router} />)

    await act(async () => {
      await canonicalLocation
    })

    expect(loader).toHaveBeenCalledTimes(1)
    expect(loaderLocations).toEqual(['/about?page=1'])
    expect(loaderSignals).toHaveLength(1)
    expect(loaderSignals[0]?.aborted).toBe(false)

    expect(
      await screen.findByText('/about?page=1', {
        selector: '[data-testid="pending-location"]',
      }),
    ).toBeInTheDocument()

    await act(() => {
      loaderGate.resolve('about data')
    })

    expect(await screen.findByTestId('about-data')).toHaveTextContent(
      'about data',
    )
    expect(loader).toHaveBeenCalledTimes(1)
    expect(loaderSignals[0]?.aborted).toBe(false)
    expect(errorComponentRendered).not.toHaveBeenCalled()
    expect(screen.queryByTestId('about-error')).not.toBeInTheDocument()
  } finally {
    unsubscribeHistory()
    await act(() => {
      canonicalLocation.resolve()
      loaderGate.resolve('about data')
    })
  }
})
