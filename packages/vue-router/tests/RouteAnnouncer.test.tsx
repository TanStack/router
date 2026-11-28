import { Teleport } from 'vue'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  HeadContent,
  Link,
  Outlet,
  RouteAnnouncer,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
})

function setup() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Teleport to="head">
          <HeadContent />
        </Teleport>
        <RouteAnnouncer />
        <nav>
          <Link to="/about">About</Link>
        </nav>
        <main>
          <Outlet />
        </main>
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    head: () => ({ meta: [{ title: 'Home | App' }] }),
    component: () => <h1>Home</h1>,
  })
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    head: () => ({ meta: [{ title: 'About | App' }] }),
    component: () => <h1>About</h1>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const onRendered = vi.fn()
  const unsubscribe = router.subscribe('onRendered', onRendered)

  render(<RouterProvider router={router} />)

  return { router, onRendered, unsubscribe }
}

const getRegion = () => document.querySelector('[aria-live="polite"]')

test('announces nothing and leaves focus alone on the initial render', async () => {
  const { onRendered, unsubscribe } = setup()

  expect(await screen.findByRole('heading', { name: 'Home' })).toBeVisible()
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))
  unsubscribe()

  expect(getRegion()).toHaveAttribute('aria-atomic', 'true')
  expect(getRegion()).toBeEmptyDOMElement()
  expect(document.activeElement).toBe(document.body)
})

test('focuses the new h1 and announces the new title after a navigation to a new path', async () => {
  const { onRendered, unsubscribe } = setup()
  await screen.findByRole('heading', { name: 'Home' })
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))
  unsubscribe()

  fireEvent.click(screen.getByRole('link', { name: 'About' }))

  const heading = await screen.findByRole('heading', { name: 'About' })
  await waitFor(() => expect(getRegion()).toHaveTextContent('About | App'))
  expect(heading).toHaveFocus()
  expect(heading).toHaveAttribute('tabindex', '-1')
})

test.each([
  ['search-only', '/?page=2'],
  ['hash-only', '/#details'],
])(
  'leaves focus and the region alone on a %s navigation',
  async (_name, href) => {
    const { router, onRendered, unsubscribe } = setup()
    await screen.findByRole('heading', { name: 'Home' })
    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))

    const link = screen.getByRole('link', { name: 'About' })
    link.focus()
    router.history.push(href)
    await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(2))
    unsubscribe()

    expect(router.state.location.href).toBe(href)
    expect(link).toHaveFocus()
    expect(getRegion()).toBeEmptyDOMElement()
  },
)
