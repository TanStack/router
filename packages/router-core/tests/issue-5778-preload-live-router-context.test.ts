import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue #5778: updating router.options.context (what RouterProvider's
 * `context` prop does via router.update()) is picked up by the next
 * navigation's beforeLoad, but an intent preload that borrows the active
 * root match still derives descendant context from the root's previously
 * committed context — so the preloaded route's beforeLoad sees the
 * expired value until the first real navigation.
 *
 * Desired behavior: a preload derives ancestor context the same way a
 * navigation would — live router.options.context merged under the
 * ancestors' committed route/beforeLoad contexts.
 */

function setup() {
  const seen: Array<unknown> = []
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const authRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    id: '_authenticated',
    beforeLoad: ({ context }) => {
      seen.push((context as any).foo)
    },
  })
  const fooRoute = new BaseRoute({
    getParentRoute: () => authRoute,
    path: '/foo',
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      authRoute.addChildren([fooRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { foo: 'old' },
  } as any)

  const updateContext = (foo: string) => {
    router.update({
      ...router.options,
      context: { ...router.options.context, foo },
    } as any)
  }

  return { router, seen, updateContext }
}

// KNOWN GAP (kept as an expected failure): a preload that borrows the active
// root match derives descendant context from the root's committed context
// snapshot, not live router.options.context. Fixing this means recomputing
// borrowed ancestors' contexts from their stored __routeContext /
// __beforeLoadContext layers — a change to the read-only borrow protocol
// that belongs in a dedicated follow-up, not this PR. The documented
// workaround (router.invalidate() after context changes) is pinned below.
test.fails(
  'preload sees updated router context without an explicit invalidate',
  async () => {
    const { router, seen, updateContext } = setup()

    await router.load()
    updateContext('new')

    // Hover intent: the preload borrows the active root match. Its
    // committed context must not shadow the live router context that a
    // navigation would see.
    await router.preloadRoute({ to: '/foo' } as any)
    expect(seen).toEqual(['new'])

    // Sanity: a real navigation sees the same value.
    await router.navigate({ to: '/foo' } as any)
    await router.latestLoadPromise
    expect(seen).toEqual(['new', 'new'])
  },
)

test('preload sees updated router context after the documented invalidate() pattern', async () => {
  const { router, seen, updateContext } = setup()

  await router.load()
  updateContext('new')
  await router.invalidate()
  await router.latestLoadPromise

  await router.preloadRoute({ to: '/foo' } as any)
  expect(seen).toEqual(['new'])
})
