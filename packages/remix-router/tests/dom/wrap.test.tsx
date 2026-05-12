/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `Wrap` and `InnerWrap` router options. Both are React-shape
 * function components (`(props) => Node`) — the binding calls them
 * directly rather than rendering as JSX so the same value works
 * across React/Solid/Remix.
 *
 * Wrap envelopes the entire router context. InnerWrap envelopes just
 * the match tree (inside the router context, inside the global catch
 * boundary). Useful for app providers that need `useRouter`.
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
  useRouter,
} from '../../src'
import type { Handle, RemixNode } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function setup(opts: {
  Wrap?: (props: { children: RemixNode }) => RemixNode
  InnerWrap?: (props: { children: RemixNode }) => RemixNode
}) {
  function Root(_h: Handle) {
    return () => (
      <>
        <Outlet />
      </>
    )
  }
  function Index(_h: Handle) {
    return () => <p id="page">leaf</p>
  }

  const root = createRootRoute({ component: Root })
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: Index,
  })
  root.addChildren([index])

  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    Wrap: opts.Wrap,
    InnerWrap: opts.InnerWrap,
  } as any)
}

describe('router options Wrap / InnerWrap', () => {
  test('Wrap envelopes the entire RouterProvider tree', async () => {
    const router = setup({
      Wrap: ({ children }) => (
        <div id="wrap">
          <p id="wrap-marker">wrap-active</p>
          {children}
        </div>
      ),
    })
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#wrap-marker')?.textContent).toBe('wrap-active')
    expect(result.$('#wrap')?.contains(result.$('#page'))).toBe(true)
  })

  test('InnerWrap envelopes only the match tree (inside router context)', async () => {
    const routerInsideInnerWrap: unknown = null
    const router = setup({
      InnerWrap: ({ children }) => (
        <div id="inner-wrap">
          <p id="inner-wrap-marker">inner-active</p>
          {children}
        </div>
      ),
    })
    void routerInsideInnerWrap
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#inner-wrap-marker')?.textContent).toBe('inner-active')
    expect(result.$('#inner-wrap')?.contains(result.$('#page'))).toBe(true)
  })

  test('InnerWrap can use useRouter — the router context is in scope', async () => {
    function ProviderWithRouter({ children }: { children: RemixNode }): RemixNode {
      // This is a remix/ui factory rendered as a React-shape function. We
      // can't call useRouter directly here because we don't have a handle.
      // Instead nest a real factory component inside.
      return <CapturedProvider>{children}</CapturedProvider>
    }
    function CapturedProvider(handle: Handle<{ children: RemixNode }>) {
      const router = useRouter(handle)
      return ({ children }: { children?: RemixNode }) => (
        <div id="captured" data-href={router.history.location.pathname}>
          {children}
        </div>
      )
    }

    const router = setup({ InnerWrap: ProviderWithRouter })
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    const captured = result.$('#captured')
    expect(captured).toBeTruthy()
    expect(captured?.getAttribute('data-href')).toBe('/')
  })

  test('no Wrap / InnerWrap — tree renders unchanged', async () => {
    const router = setup({})
    await router.load()
    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#page')?.textContent).toBe('leaf')
    expect(result.$('#wrap')).toBeFalsy()
    expect(result.$('#inner-wrap')).toBeFalsy()
  })
})
