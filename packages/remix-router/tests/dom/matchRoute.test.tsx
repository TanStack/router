/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `<MatchRoute>` conditional rendering — accepts a `to` (and
 * optionally `params`/`search`) and renders children only when the
 * current location matches.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  MatchRoute,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function setup(initial = '/') {
  function Root(_h: Handle) {
    return () => (
      <main>
        <MatchRoute to="/users">
          <p id="match-users">on /users</p>
        </MatchRoute>
        <MatchRoute to="/users/$id" params={{ id: '7' }}>
          <p id="match-user-7">on /users/7</p>
        </MatchRoute>
        <Outlet />
      </main>
    )
  }
  const root = createRootRoute({ component: Root })
  const home = createRoute({ getParentRoute: () => root, path: '/' })
  const users = createRoute({ getParentRoute: () => root, path: 'users' })
  const user = createRoute({
    getParentRoute: () => users,
    path: '$id',
  })
  users.addChildren([user])
  root.addChildren([home, users])
  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: [initial] }),
  })
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('MatchRoute', () => {
  test('renders only when current path matches `to`', async () => {
    const router = setup('/users')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#match-users')).toBeTruthy()
    expect(result.$('#match-user-7')).toBeFalsy()
  })

  test('does NOT render when params differ', async () => {
    const router = setup('/users/8')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#match-user-7')).toBeFalsy()
  })

  test('toggles on navigation', async () => {
    const router = setup('/')
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#match-users')).toBeFalsy()

    await router.navigate({ to: '/users' })
    await router.load()
    await flush()

    expect(result.$('#match-users')).toBeTruthy()
  })
})
