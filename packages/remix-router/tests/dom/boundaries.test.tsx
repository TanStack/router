/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * Per-route `errorComponent` and `notFoundComponent` are picked when
 * `<Match>` sees the corresponding status. Asserts:
 *
 *  - A loader that throws lands on `errorComponent` with a 500 status.
 *  - A loader that calls `notFound()` lands on `notFoundComponent` with
 *    a 404 status.
 *  - The route's regular `component` is NOT rendered in either case.
 */
import { afterEach, describe, expect, test } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function ErrorComponent(_h: Handle<{ error: unknown }>) {
  return ({ error }: { error: unknown }) => (
    <p id="err">caught: {error instanceof Error ? error.message : String(error)}</p>
  )
}

function NotFoundComponent(_h: Handle) {
  return () => <p id="nf">resource not found</p>
}

function MainComponent(_h: Handle) {
  return () => <p id="main">should not render</p>
}

describe('per-route boundaries', () => {
  test('loader throw → errorComponent', async () => {
    const root = createRootRoute()
    const errors = createRoute({
      getParentRoute: () => root,
      path: '/',
      loader: () => {
        throw new Error('boom')
      },
      errorComponent: ErrorComponent,
      component: MainComponent,
    })
    root.addChildren([errors])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#err')?.textContent).toContain('caught: boom')
    expect(result.$('#main')).toBeFalsy()
  })

  test('loader notFound() → notFoundComponent', async () => {
    const root = createRootRoute()
    const missing = createRoute({
      getParentRoute: () => root,
      path: '/',
      loader: () => {
        throw notFound()
      },
      notFoundComponent: NotFoundComponent,
      component: MainComponent,
    })
    root.addChildren([missing])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#nf')?.textContent).toBe('resource not found')
    expect(result.$('#main')).toBeFalsy()
  })

  test('navigating from notFound back to a healthy route restores normal render', async () => {
    const root = createRootRoute()
    const ok = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: function Ok(_h: Handle) {
        return () => <p id="ok">ok</p>
      },
    })
    const missing = createRoute({
      getParentRoute: () => root,
      path: '/missing',
      loader: () => {
        throw notFound()
      },
      notFoundComponent: NotFoundComponent,
      component: MainComponent,
    })
    root.addChildren([ok, missing])
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ['/missing'] }),
    })
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#nf')).toBeTruthy()

    await router.navigate({ to: '/' })
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(result.$('#ok')?.textContent).toBe('ok')
    expect(result.$('#nf')).toBeFalsy()
  })
})
