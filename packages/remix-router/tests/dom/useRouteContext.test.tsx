/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `useRouteContext` reads the per-match context object built up by
 * `beforeLoad` and `context` route options. Confirm it's reactive and
 * returns the latest context value when navigating.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useRouteContext,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

describe('useRouteContext', () => {
  test('returns the per-match context object built by beforeLoad', async () => {
    function Root(_h: Handle) {
      return () => <Outlet />
    }
    function Page(handle: Handle) {
      const readCtx = useRouteContext(handle, { from: '/' })
      return () => {
        const ctx = readCtx() as { greeting: string }
        return <p id="ctx">{ctx.greeting}</p>
      }
    }

    const root = createRootRoute({
      component: Root,
      beforeLoad: () => ({ greeting: 'hello from root' }),
    })
    const home = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: Page,
    })
    root.addChildren([home])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup
    expect(result.$('#ctx')?.textContent).toBe('hello from root')
  })
})
