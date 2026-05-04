/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function setup(initialPath: string) {
  function Root(_h: Handle) {
    return () => (
      <>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/posts">Posts</Link>
        </nav>
        <Outlet />
      </>
    )
  }
  const root = createRootRoute({ component: Root })
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: (_h: Handle) => () => <h1 id="page">Home</h1>,
  })
  const posts = createRoute({
    getParentRoute: () => root,
    path: '/posts',
    component: (_h: Handle) => () => <h1 id="page">Posts</h1>,
  })
  root.addChildren([index, posts])

  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
  return router
}

describe('<Link>', () => {
  test('left-click intercepts navigation', async () => {
    const router = setup('/')
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#page')?.textContent).toBe('Home')

    const postsLink = result.$$('nav a')[1] as HTMLAnchorElement
    expect(postsLink.getAttribute('href')).toBe('/posts')

    // Use the Web API's MouseEvent so we exercise the same code path as a
    // real left-click.
    await result.act(async () => {
      postsLink.dispatchEvent(
        new MouseEvent('click', { button: 0, bubbles: true, cancelable: true }),
      )
      // Wait for navigate's microtasks + the load() await chain.
      await new Promise((r) => setTimeout(r, 30))
    })

    expect(router.stores.location.get().pathname).toBe('/posts')
  })

  test('renders the active state on the matching link', async () => {
    const router = setup('/posts')
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    const links = result.$$('nav a')
    expect(links[0]?.getAttribute('data-status')).toBe(null)
    expect(links[1]?.getAttribute('data-status')).toBe('active')
    expect(links[1]?.getAttribute('aria-current')).toBe('page')
  })

  test('respects external absolute URLs', async () => {
    const router = setup('/')
    await router.load()

    function ExternalRoot(_h: Handle) {
      return () => (
        <Link to="https://example.com" id="ext">
          Example
        </Link>
      )
    }
    // Replace the root component for this test.
    ;(router.routesById['__root__'] as any).options.component = ExternalRoot

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    const link = result.$('#ext') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://example.com')
  })
})
