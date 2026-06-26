import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useIsBackNavigation,
} from '../src'

beforeEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
afterEach(() => {
  cleanup()
})

function HookProbe() {
  const backToHome = useIsBackNavigation({ to: '/' })
  const backToContact = useIsBackNavigation({ to: '/contact' })
  return (
    <>
      <span data-testid="hook-home">{String(backToHome)}</span>
      <span data-testid="hook-contact">{String(backToContact)}</span>
    </>
  )
}

function RootComponent() {
  return (
    <>
      <Link to="/">Home</Link>
      <Link to="/about">About</Link>
      <Link to="/contact">Contact</Link>
      <Link to="/" preferBack data-testid="preferback-home">
        Back home
      </Link>
      <Link to="/contact" preferBack data-testid="preferback-contact">
        Prefer contact
      </Link>
      <HookProbe />
      <Outlet />
    </>
  )
}

function setup(initialEntries: Array<string> = ['/']) {
  const rootRoute = createRootRoute({ component: RootComponent })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <h1>IndexTitle</h1>,
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    component: () => <h1>AboutTitle</h1>,
  })
  const contactRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/contact',
    component: () => <h1>ContactTitle</h1>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute, contactRoute]),
    history: createMemoryHistory({ initialEntries }),
  })

  const utils = render(<RouterProvider router={router} />)
  return { router, ...utils }
}

describe('useIsBackNavigation', () => {
  test('is false at the start of history (no previous entry)', async () => {
    setup(['/'])
    await screen.findByText('IndexTitle')

    // index 0 — nothing behind, so neither target is a back navigation.
    expect(screen.getByTestId('hook-home')).toHaveTextContent('false')
    expect(screen.getByTestId('hook-contact')).toHaveTextContent('false')
  })

  test('is true only when the target equals the previous entry', async () => {
    const { router } = setup(['/'])
    await screen.findByText('IndexTitle')

    await act(() => fireEvent.click(screen.getByText('About')))
    await screen.findByText('AboutTitle')

    // Previous entry (index 0) is "/", so a link to "/" is a back navigation,
    // but a link to "/contact" is not.
    expect(router.history.location.state.__TSR_index).toBe(1)
    expect(screen.getByTestId('hook-home')).toHaveTextContent('true')
    expect(screen.getByTestId('hook-contact')).toHaveTextContent('false')
  })

  test('falls back to false when the previous entry is unknown (deep link)', async () => {
    // Router starts at index 1; entry 0 ("/") was never recorded by the router.
    const { router } = setup(['/', '/about'])
    await screen.findByText('AboutTitle')

    expect(router.history.location.state.__TSR_index).toBe(1)
    expect(router.getHistoryEntry(0)).toBeUndefined()
    expect(screen.getByTestId('hook-home')).toHaveTextContent('false')
  })
})

describe('Link preferBack', () => {
  test('keeps a real <a href> regardless of decision', async () => {
    setup(['/'])
    await screen.findByText('IndexTitle')

    const link = screen.getByTestId('preferback-home')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/')
  })

  test('goes back when the target is the previous entry', async () => {
    const { router } = setup(['/'])
    await screen.findByText('IndexTitle')

    await act(() => fireEvent.click(screen.getByText('About')))
    await screen.findByText('AboutTitle')
    expect(router.history.location.state.__TSR_index).toBe(1)

    const backSpy = vi.spyOn(router.history, 'back')

    await act(() => fireEvent.click(screen.getByTestId('preferback-home')))
    await screen.findByText('IndexTitle')

    expect(backSpy).toHaveBeenCalledTimes(1)
    // Popped rather than pushed: index decreased to 0, forward history kept.
    expect(router.history.location.state.__TSR_index).toBe(0)
  })

  test('pushes normally when the target is not the previous entry', async () => {
    const { router } = setup(['/'])
    await screen.findByText('IndexTitle')

    await act(() => fireEvent.click(screen.getByText('About')))
    await screen.findByText('AboutTitle')

    const backSpy = vi.spyOn(router.history, 'back')

    // Previous entry is "/", target is "/contact" → no match → push.
    await act(() => fireEvent.click(screen.getByTestId('preferback-contact')))
    await screen.findByText('ContactTitle')

    expect(backSpy).not.toHaveBeenCalled()
    expect(router.history.location.state.__TSR_index).toBe(2)
  })

  test('pushes normally when the previous entry is unknown (deep link)', async () => {
    const { router } = setup(['/', '/about'])
    await screen.findByText('AboutTitle')

    const backSpy = vi.spyOn(router.history, 'back')

    await act(() => fireEvent.click(screen.getByTestId('preferback-home')))
    await screen.findByText('IndexTitle')

    expect(backSpy).not.toHaveBeenCalled()
    // Fell back to a push: a new entry at index 2, not a pop to index 0.
    expect(router.history.location.state.__TSR_index).toBe(2)
  })

  describe('match modes (pathname vs exact)', () => {
    function ModeProbe() {
      const exactMatch = useIsBackNavigation({ to: '/about', search: { page: 3 } }, 'exact')
      const exactNoMatch = useIsBackNavigation({ to: '/about', search: { page: 9 } }, 'exact')
      const pathnameDiffSearch = useIsBackNavigation({ to: '/about', search: { page: 9 } }, 'pathname')
      return (
        <>
          <span data-testid="exact-match">{String(exactMatch)}</span>
          <span data-testid="exact-nomatch">{String(exactNoMatch)}</span>
          <span data-testid="pathname-diffsearch">{String(pathnameDiffSearch)}</span>
        </>
      )
    }

    function setupModes() {
      const rootRoute = createRootRoute({
        component: () => (
          <>
            <Link to="/about" search={{ page: 3 }}>
              About 3
            </Link>
            <Link to="/contact">Contact</Link>
            <Link to="/about" search={{ page: 3 }} preferBack="exact" data-testid="exact-back">
              Exact back (match)
            </Link>
            <Link to="/about" search={{ page: 9 }} preferBack="exact" data-testid="exact-push">
              Exact back (no match)
            </Link>
            <ModeProbe />
            <Outlet />
          </>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <h1>IndexTitle</h1>,
      })
      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        validateSearch: (search: Record<string, unknown>) => ({
          page: search.page as number | undefined,
        }),
        component: () => <h1>AboutTitle</h1>,
      })
      const contactRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/contact',
        component: () => <h1>ContactTitle</h1>,
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, aboutRoute, contactRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      const utils = render(<RouterProvider router={router} />)
      return { router, ...utils }
    }

    // Sets up history so the previous entry is /about?page=3.
    async function arrangePreviousAboutPage3() {
      const utils = setupModes()
      await screen.findByText('IndexTitle')
      await act(() => fireEvent.click(screen.getByText('About 3')))
      await screen.findByText('AboutTitle')
      await act(() => fireEvent.click(screen.getByText('Contact')))
      await screen.findByText('ContactTitle')
      expect(utils.router.history.location.state.__TSR_index).toBe(2)
      return utils
    }

    test('exact: true only when pathname AND search match the previous entry', async () => {
      await arrangePreviousAboutPage3()

      expect(screen.getByTestId('exact-match')).toHaveTextContent('true')
      expect(screen.getByTestId('exact-nomatch')).toHaveTextContent('false')
      // pathname mode ignores search, so a differing search still matches.
      expect(screen.getByTestId('pathname-diffsearch')).toHaveTextContent('true')
    })

    test('preferBack="exact" goes back when search matches', async () => {
      const { router } = await arrangePreviousAboutPage3()
      const backSpy = vi.spyOn(router.history, 'back')

      await act(() => fireEvent.click(screen.getByTestId('exact-back')))
      await screen.findByText('AboutTitle')

      expect(backSpy).toHaveBeenCalledTimes(1)
      expect(router.history.location.state.__TSR_index).toBe(1)
    })

    test('preferBack="exact" pushes when search differs', async () => {
      const { router } = await arrangePreviousAboutPage3()
      const backSpy = vi.spyOn(router.history, 'back')

      await act(() => fireEvent.click(screen.getByTestId('exact-push')))
      await screen.findByText('AboutTitle')

      expect(backSpy).not.toHaveBeenCalled()
      expect(router.history.location.state.__TSR_index).toBe(3)
    })
  })

  describe('click guards do not trigger back navigation', () => {
    async function setupAtAbout() {
      const utils = setup(['/'])
      await screen.findByText('IndexTitle')
      await act(() => fireEvent.click(screen.getByText('About')))
      await screen.findByText('AboutTitle')
      const backSpy = vi.spyOn(utils.router.history, 'back')
      return { ...utils, backSpy }
    }

    test('middle-click (button !== 0) is ignored', async () => {
      const { backSpy } = await setupAtAbout()
      await act(() =>
        fireEvent.click(screen.getByTestId('preferback-home'), { button: 1 }),
      )
      expect(backSpy).not.toHaveBeenCalled()
    })

    test('modifier-click (metaKey) is ignored', async () => {
      const { backSpy } = await setupAtAbout()
      await act(() =>
        fireEvent.click(screen.getByTestId('preferback-home'), {
          metaKey: true,
        }),
      )
      expect(backSpy).not.toHaveBeenCalled()
    })

    test('a user onClick calling preventDefault suppresses back navigation', async () => {
      const onClick = vi.fn((e: React.MouseEvent) => e.preventDefault())

      const rootRoute = createRootRoute({
        component: () => (
          <>
            <Link to="/about">About</Link>
            <Link
              to="/"
              preferBack
              data-testid="preferback-home"
              onClick={onClick}
            >
              Back home
            </Link>
            <Outlet />
          </>
        ),
      })
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => <h1>IndexTitle</h1>,
      })
      const aboutRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/about',
        component: () => <h1>AboutTitle</h1>,
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })
      render(<RouterProvider router={router} />)
      await screen.findByText('IndexTitle')
      await act(() => fireEvent.click(screen.getByText('About')))
      await screen.findByText('AboutTitle')

      const backSpy = vi.spyOn(router.history, 'back')
      await act(() => fireEvent.click(screen.getByTestId('preferback-home')))

      expect(onClick).toHaveBeenCalledTimes(1)
      expect(backSpy).not.toHaveBeenCalled()
    })
  })
})
