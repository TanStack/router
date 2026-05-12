/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `useBlocker` ref-driven update tests. Asserts:
 *
 *  - The hook returns `{ read, update }` after setup.
 *  - The blocker is registered exactly once on the underlying history
 *    (the pre-fix `Block` re-called `useBlocker` from render, leaking
 *    blockers per opts change).
 *  - `update(opts)` swaps the closure-held opts so the SAME registered
 *    blockerFn picks up new `shouldBlockFn` / `disabled` values.
 *  - `handle.signal` abort fires the registered teardown.
 *
 * Tests use `vi.spyOn(router.history, 'block')` to capture the
 * blockerFn directly and invoke it — this avoids the
 * environment-sensitive integration with `router.navigate` and pins
 * the contract independently.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  Block,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function makeRouter() {
  const root = createRootRoute({
    component: function Root(_h: Handle) {
      return () => null
    },
  })
  const home = createRoute({ getParentRoute: () => root, path: '/' })
  const other = createRoute({ getParentRoute: () => root, path: '/other' })
  root.addChildren([home, other])

  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function makeFakeHandle(router: ReturnType<typeof makeRouter>) {
  const ctrl = new AbortController()
  return {
    handle: {
      signal: ctrl.signal,
      update: vi.fn(),
      props: {},
      context: { set: () => {}, get: () => router },
    } as unknown as Handle<any, any>,
    abort: () => ctrl.abort(),
  }
}

const blockerCallArgs = {
  action: 'PUSH' as const,
  currentLocation: { pathname: '/', search: '', hash: '', href: '/', state: {} as any },
  nextLocation: {
    pathname: '/other',
    search: '',
    hash: '',
    href: '/other',
    state: {} as any,
  },
}

describe('useBlocker', () => {
  test('returns { read, update } after setup', () => {
    const router = makeRouter()
    const { handle } = makeFakeHandle(router)
    const result = useBlocker(handle, { shouldBlockFn: () => false })
    expect(result.read).toBeInstanceOf(Function)
    expect(result.update).toBeInstanceOf(Function)
    expect(result.read().status).toBe('idle')
  })

  test('registers exactly one blocker on history.block', () => {
    const router = makeRouter()
    const blockSpy = vi.spyOn(router.history, 'block')
    const { handle } = makeFakeHandle(router)
    const blocker = useBlocker(handle, { shouldBlockFn: () => false })

    expect(blockSpy).toHaveBeenCalledTimes(1)

    // update(opts) must NOT register a new blocker.
    blocker.update({ shouldBlockFn: () => true })
    blocker.update({ shouldBlockFn: () => false, disabled: true })
    blocker.update({ shouldBlockFn: () => false, disabled: false })
    expect(blockSpy).toHaveBeenCalledTimes(1)
  })

  test('handle.signal abort calls the unblock teardown', () => {
    const router = makeRouter()
    const unblock = vi.fn()
    router.history.block = vi.fn(() => unblock) as any

    const { handle, abort } = makeFakeHandle(router)
    useBlocker(handle, { shouldBlockFn: () => false })

    expect(unblock).not.toHaveBeenCalled()
    abort()
    expect(unblock).toHaveBeenCalledTimes(1)
  })

  test('disabled flag short-circuits the registered blockerFn at invocation time', async () => {
    const router = makeRouter()
    let blockerFn: any
    router.history.block = vi.fn((b: any) => {
      blockerFn = b.blockerFn
      return () => {}
    }) as any

    const { handle } = makeFakeHandle(router)
    const shouldBlock = vi.fn(() => true)
    const blocker = useBlocker(handle, {
      shouldBlockFn: shouldBlock,
      disabled: true,
    })

    expect(await blockerFn(blockerCallArgs)).toBe(false)
    expect(shouldBlock).not.toHaveBeenCalled()

    // Flip to disabled=false. The SAME blockerFn now invokes shouldBlock.
    blocker.update({ shouldBlockFn: shouldBlock, disabled: false })
    await blockerFn(blockerCallArgs)
    expect(shouldBlock).toHaveBeenCalledTimes(1)
  })

  test('shouldBlockFn ref-swap propagates without re-registering', async () => {
    const router = makeRouter()
    let blockerFn: any
    router.history.block = vi.fn((b: any) => {
      blockerFn = b.blockerFn
      return () => {}
    }) as any

    const { handle } = makeFakeHandle(router)
    const initial = vi.fn(() => false)
    const replacement = vi.fn(() => true)
    const blocker = useBlocker(handle, { shouldBlockFn: initial })

    await blockerFn(blockerCallArgs)
    expect(initial).toHaveBeenCalledTimes(1)
    expect(replacement).not.toHaveBeenCalled()

    blocker.update({ shouldBlockFn: replacement })

    await blockerFn(blockerCallArgs)
    expect(initial).toHaveBeenCalledTimes(1) // unchanged
    expect(replacement).toHaveBeenCalledTimes(1) // hot-swapped
  })

  test('legacy (blockerFn, condition) form: update() refreshes condition reactively', async () => {
    // Legacy form captures `condition` as a primitive at setup time,
    // so the only way to refresh it without leaking blockers is via
    // `update(blockerFn, latestCondition)`. This test pins that
    // contract — the same registered blockerFn must reflect the new
    // condition after `update()`.
    const router = makeRouter()
    let blockerFn: any
    const blockSpy = vi.fn((b: any) => {
      blockerFn = b.blockerFn
      return () => {}
    })
    router.history.block = blockSpy as any

    const { handle } = makeFakeHandle(router)
    const legacyFn = vi.fn(() => true)
    const blocker: any = useBlocker(handle as any, legacyFn as any, true)

    expect(blockSpy).toHaveBeenCalledTimes(1)
    expect(await blockerFn(blockerCallArgs)).toBe(true)
    expect(legacyFn).toHaveBeenCalledTimes(1)

    // Refresh the condition to false via update(blockerFn, condition).
    // The same registered blockerFn must now short-circuit and skip
    // calling `legacyFn`.
    blocker.update(legacyFn, false)
    expect(blockSpy).toHaveBeenCalledTimes(1) // no re-register
    expect(await blockerFn(blockerCallArgs)).toBe(false)
    expect(legacyFn).toHaveBeenCalledTimes(1) // not called again
  })

  test('legacy { blockerFn, condition } form: update() refreshes condition reactively', async () => {
    const router = makeRouter()
    let blockerFn: any
    const blockSpy = vi.fn((b: any) => {
      blockerFn = b.blockerFn
      return () => {}
    })
    router.history.block = blockSpy as any

    const { handle } = makeFakeHandle(router)
    const fn = vi.fn(() => 'blocked')
    const blocker: any = useBlocker(handle as any, {
      blockerFn: fn,
      condition: true,
    } as any)

    expect(await blockerFn(blockerCallArgs)).toBe('blocked')
    expect(fn).toHaveBeenCalledTimes(1)

    // New legacy object — the original closure was captured by
    // reference, but `update` re-resolves so the new object's
    // `condition: false` is what's read on the next nav.
    blocker.update({ blockerFn: fn, condition: false })
    expect(blockSpy).toHaveBeenCalledTimes(1) // still single registration
    expect(await blockerFn(blockerCallArgs)).toBe(false)
    expect(fn).toHaveBeenCalledTimes(1) // not called again
  })

  test('withResolver: blocked navigation surfaces a blocked resolver and proceed/reset toggles state', async () => {
    // Pin the contract that a registered blocker with `withResolver`
    // produces a 'blocked' resolver state when shouldBlockFn returns
    // true, and that proceed()/reset() return the resolver to idle.
    const router = makeRouter()
    let blockerFn: any
    router.history.block = vi.fn((b: any) => {
      blockerFn = b.blockerFn
      return () => {}
    }) as any

    const { handle } = makeFakeHandle(router)
    const blocker = useBlocker(handle, {
      shouldBlockFn: () => true,
      withResolver: true,
    } as any)

    expect(blocker.read().status).toBe('idle')

    // Trigger the blockerFn — this must produce a Promise that resolves
    // when the resolver is ack'd. We assert the intermediate state.
    const inflight = blockerFn(blockerCallArgs)

    // Yield once for the async closure to set up its internal Promise.
    await Promise.resolve()
    await Promise.resolve()

    const resolver = blocker.read()
    expect(resolver.status).toBe('blocked')
    expect(resolver.action).toBe('PUSH')
    expect(typeof (resolver as any).proceed).toBe('function')
    expect(typeof (resolver as any).reset).toBe('function')
    expect(handle.update).toHaveBeenCalled()

    // proceed() means "let the navigation through" — blockerFn returns
    // false (no block).
    ;(resolver as any).proceed()
    const result = await inflight
    expect(result).toBe(false)
    expect(blocker.read().status).toBe('idle')
  })

  test('withResolver: reset() cancels the navigation', async () => {
    const router = makeRouter()
    let blockerFn: any
    router.history.block = vi.fn((b: any) => {
      blockerFn = b.blockerFn
      return () => {}
    }) as any

    const { handle } = makeFakeHandle(router)
    const blocker = useBlocker(handle as any, {
      shouldBlockFn: () => true,
      withResolver: true,
    } as any)

    const inflight = blockerFn(blockerCallArgs)
    await Promise.resolve()
    await Promise.resolve()

    const resolver = blocker.read()
    expect(resolver.status).toBe('blocked')
    ;(resolver as any).reset()
    const result = await inflight
    expect(result).toBe(true) // reset → block the navigation
    expect(blocker.read().status).toBe('idle')
  })
})

describe('<Block>', () => {
  test('renders children passed as a vnode', async () => {
    const router = makeRouter()
    await router.load()

    function Root(_h: Handle) {
      return () => (
        <main>
          <Block shouldBlockFn={() => false}>
            <p id="block-children">block-children</p>
          </Block>
          <Outlet />
        </main>
      )
    }
    ;(router.routesById['__root__'] as any).options.component = Root

    const result = render(<RouterProvider router={router} />)
    expect(result.$('#block-children')?.textContent).toBe('block-children')
    result.cleanup()
  })

  test('renders via the `render` prop with the resolver', async () => {
    const router = makeRouter()
    await router.load()

    function Root(_h: Handle) {
      return () => (
        <main>
          <Block
            shouldBlockFn={() => false}
            withResolver
            render={(resolver: any) => (
              <p id="resolver-status">{resolver.status}</p>
            )}
          />
          <Outlet />
        </main>
      )
    }
    ;(router.routesById['__root__'] as any).options.component = Root

    const result = render(<RouterProvider router={router} />)
    expect(result.$('#resolver-status')?.textContent).toBe('idle')
    result.cleanup()
  })

  test('registers a single blocker even across re-renders', async () => {
    const router = makeRouter()
    const blockSpy = vi.spyOn(router.history, 'block')
    await router.load()

    function Root(handle: Handle) {
      return () => (
        <main>
          <Block shouldBlockFn={() => true}>
            <p id="block-content">guarded</p>
          </Block>
          <Outlet />
        </main>
      )
    }
    ;(router.routesById['__root__'] as any).options.component = Root

    const result = render(<RouterProvider router={router} />)
    // Trigger a few re-renders by navigating in place.
    await router.navigate({ to: '/' })
    await new Promise((r) => setTimeout(r, 0))
    await router.navigate({ to: '/' })
    await new Promise((r) => setTimeout(r, 0))

    expect(blockSpy).toHaveBeenCalledTimes(1)
    result.cleanup()
  })
})
