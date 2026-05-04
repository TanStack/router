/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * Smoke test for the redirect-handling pattern that
 * `@tanstack/remix-start`'s `useServerFn` exposes. We can't import
 * `useServerFn` from here without a circular workspace dep, so we
 * inline the same logic — the contract is small enough to test
 * directly: when a wrapped fn throws a `redirect()`, the wrapper
 * patches `_fromLocation` and dispatches `router.navigate`.
 */
import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  createRootRoute,
  createRoute,
  createRouter,
  isRedirect,
  redirect,
} from '../../src'
import type { Handle } from '@remix-run/ui'

function makeRouter() {
  const root = createRootRoute()
  const home = createRoute({ getParentRoute: () => root, path: '/' })
  const dest = createRoute({ getParentRoute: () => root, path: '/dest' })
  root.addChildren([home, dest])
  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function wrapWithRedirectHandler<T extends (...args: Array<any>) => Promise<any>>(
  router: ReturnType<typeof makeRouter>,
  fn: T,
): (...args: Parameters<T>) => ReturnType<T> {
  return (async (...args: Array<any>) => {
    try {
      const res = await fn(...args)
      if (isRedirect(res)) throw res
      return res
    } catch (err) {
      if (isRedirect(err)) {
        ;(err as any).options._fromLocation = router.stores.location.get()
        return router.navigate(router.resolveRedirect(err as any).options)
      }
      throw err
    }
  }) as any
}

describe('useServerFn redirect handling pattern', () => {
  test('redirect throws are routed through router.navigate', async () => {
    const router = makeRouter()
    const navigate = vi.spyOn(router, 'navigate')

    const fn = async () => {
      throw redirect({ to: '/dest' })
    }
    const wrapped = wrapWithRedirectHandler(router, fn)

    await wrapped()
    expect(navigate).toHaveBeenCalled()
    const arg = (navigate.mock.calls[0] as Array<any>)[0]
    expect(arg.to).toBe('/dest')
  })

  test('non-redirect errors propagate', async () => {
    const router = makeRouter()
    const fn = async () => {
      throw new Error('regular error')
    }
    const wrapped = wrapWithRedirectHandler(router, fn)
    await expect(wrapped()).rejects.toThrow('regular error')
  })

  test('successful results pass through unchanged', async () => {
    const router = makeRouter()
    const fn = async () => 42
    const wrapped = wrapWithRedirectHandler(router, fn)
    expect(await wrapped()).toBe(42)
  })
})
