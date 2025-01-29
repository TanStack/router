import { beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useCanGoForward,
  useLocation,
  useRouter,
} from '../src'

beforeEach(() => {
  cleanup()
})

describe('useCanGoForward', () => {
  function setup({
    initialIndex,
    initialEntries = ['/', '/about'],
  }: {
    initialIndex?: number
    initialEntries?: Array<string>
  } = {}) {
    function RootComponent() {
      const router = useRouter()
      const location = useLocation()
      const canGoForward = useCanGoForward()

      expect(canGoForward).toBe(location.pathname === '/about' ? false : true)

      return (
        <>
          <button onClick={() => router.history.back()}>Back</button>
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
          <Outlet />
        </>
      )
    }

    const rootRoute = createRootRoute({
      component: RootComponent,
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
      history: createMemoryHistory({ initialIndex, initialEntries }),
    })

    return render(<RouterProvider router={router} />)
  }

  test('when no location forward', async () => {
    setup()

    const aboutTitle = await screen.findByText('AboutTitle')
    expect(aboutTitle).toBeInTheDocument()

    const backButton = await screen.findByText('Back')
    fireEvent.click(backButton)

    const indexTitle = await screen.findByText('IndexTitle')
    expect(indexTitle).toBeInTheDocument()
  })

  test('when location forward', async () => {
    setup({ initialIndex: 0 })

    const indexTitle = await screen.findByText('IndexTitle')
    expect(indexTitle).toBeInTheDocument()

    const aboutLink = await screen.findByText('About')
    fireEvent.click(aboutLink)

    const aboutTitle = await screen.findByText('AboutTitle')
    expect(aboutTitle).toBeInTheDocument()
  })
})
