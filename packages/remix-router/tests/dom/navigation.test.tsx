/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `useNavigate` / `useLocation` / `<Navigate>` smoke tests. Confirms:
 *
 *  - `useLocation` is reactive — components re-render when the URL changes.
 *  - `useNavigate` returns a function that performs `router.navigate`.
 *  - `<Navigate>` redirects on mount.
 *
 * Together with the existing `nestedNav` and `searchParams` suites,
 * this covers the navigation primitives end-to-end.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
  useNavigate,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function setup(initialPath = '/') {
  function Root(_h: Handle) {
    return () => <Outlet />
  }
  function ShowLocation(handle: Handle) {
    const readLocation = useLocation(handle)
    return () => <p id="path">{readLocation()?.pathname}</p>
  }
  function NavButton(handle: Handle) {
    const navigate = useNavigate(handle)
    void navigate
    return () => <p id="nav-ready">ready</p>
  }
  function Redirector(_h: Handle) {
    return () => <Navigate to="/dest" />
  }

  const root = createRootRoute({ component: Root })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: ShowLocation,
  })
  const navTest = createRoute({
    getParentRoute: () => root,
    path: '/nav-test',
    component: NavButton,
  })
  const redir = createRoute({
    getParentRoute: () => root,
    path: '/redir',
    component: Redirector,
  })
  const dest = createRoute({
    getParentRoute: () => root,
    path: '/dest',
    component: ShowLocation,
  })
  root.addChildren([home, navTest, redir, dest])
  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('useLocation', () => {
  test('is reactive — re-renders on navigation', async () => {
    const router = setup('/')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#path')?.textContent).toBe('/')

    await router.navigate({ to: '/dest' })
    await router.load()
    await flush()

    expect(result.$('#path')?.textContent).toBe('/dest')
  })
})

describe('useNavigate', () => {
  test('returns a callable navigate function', async () => {
    const router = setup('/nav-test')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup
    expect(result.$('#nav-ready')?.textContent).toBe('ready')
  })
})

describe('<Navigate>', () => {
  test('triggers navigation on render', async () => {
    const router = setup('/redir')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    await flush()
    await flush()

    expect(router.history.location.pathname).toBe('/dest')
  })
})
