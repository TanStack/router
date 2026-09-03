import { createPortal } from 'react-dom'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  HeadContent,
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
  vi.restoreAllMocks()
})

// A head() script with `src` must be injected (and therefore executed) exactly
// once. Before the fix, the injection effect keyed off the `attrs` object
// identity, which changes on every navigation that rebuilds head tags - so
// the script was removed and re-injected (re-executed) on every navigation.
test('head() scripts with src are not re-injected on client-side navigations', async () => {
  const rootRoute = createRootRoute({
    head: () => ({
      scripts: [{ src: '/track-test.js' }],
    }),
    component: () => (
      <>
        {createPortal(<HeadContent />, document.head)}
        <Link to="/">index</Link>
        <Link to="/pool/$id" params={{ id: '123' }}>
          pool
        </Link>
        <Outlet />
      </>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    head: () => ({ meta: [{ title: 'Home Page' }] }),
    component: () => <div data-testid="index-page">index</div>,
  })
  const poolRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/pool/$id',
    head: () => ({ meta: [{ title: 'Pool Detail' }] }),
    component: () => <div data-testid="pool-page">pool</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, poolRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const injections: Array<HTMLScriptElement> = []
  const removals: Array<HTMLScriptElement> = []
  const originalAppendChild = document.head.appendChild.bind(document.head)
  vi.spyOn(document.head, 'appendChild').mockImplementation((node: any) => {
    if (
      node instanceof HTMLScriptElement &&
      node.getAttribute('src') === '/track-test.js'
    ) {
      injections.push(node)
    }
    return originalAppendChild(node)
  })
  vi.spyOn(HTMLScriptElement.prototype, 'remove').mockImplementation(
    function (this: HTMLScriptElement) {
      if (this.getAttribute('src') === '/track-test.js') {
        removals.push(this)
      }
      // Element.prototype.remove
      this.parentNode?.removeChild(this)
    },
  )

  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('index-page')).toBeInTheDocument()
  await waitFor(() => expect(document.title).toBe('Home Page'))
  expect(injections).toHaveLength(1)

  fireEvent.click(screen.getByRole('link', { name: 'pool' }))
  expect(await screen.findByTestId('pool-page')).toBeInTheDocument()
  await waitFor(() => expect(document.title).toBe('Pool Detail'))

  fireEvent.click(screen.getByRole('link', { name: 'index' }))
  expect(await screen.findByTestId('index-page')).toBeInTheDocument()
  await waitFor(() => expect(document.title).toBe('Home Page'))

  // Every re-injection re-executes the script in a real browser.
  expect(injections).toHaveLength(1)
  expect(removals).toHaveLength(0)
  expect(
    document.head.querySelectorAll('script[src="/track-test.js"]'),
  ).toHaveLength(1)
})
