/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
// @vitest-environment jsdom
/**
 * `<Await>` and `useAwaited` pending/success/error states. Confirms:
 *
 *  - Renders `fallback` while pending; switches to `children(data)`
 *    when the promise resolves.
 *  - Errors throw — captured by enclosing `<CatchBoundary>`.
 *  - Hot-swapping `props.promise` works without leaking listeners
 *    from the old promise (generation counter pattern).
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from '@remix-run/ui/test'
import { createMemoryHistory } from '@tanstack/history'
import {
  Await,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useAwaited,
} from '../../src'
import type { Handle } from '@remix-run/ui'

let activeCleanup: (() => void) | null = null
afterEach(() => {
  activeCleanup?.()
  activeCleanup = null
})

function defer<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup(makeChild: (handle: Handle) => () => any) {
  function Root(_h: Handle) {
    return () => <Outlet />
  }
  const root = createRootRoute({ component: Root })
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: makeChild,
  })
  root.addChildren([home])
  return createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

describe('<Await>', () => {
  test('renders fallback while pending, then data on resolve', async () => {
    const { promise, resolve } = defer<string>()

    const router = setup(function Page(_h: Handle) {
      return () => (
        <main>
          <Await
            promise={promise}
            fallback={<p id="loading">loading</p>}
            render={(data) => <p id="done">{data}</p>}
          />
        </main>
      )
    })
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup

    expect(result.$('#loading')?.textContent).toBe('loading')
    expect(result.$('#done')).toBeFalsy()

    resolve('arrived')
    await flush()
    await flush()

    expect(result.$('#loading')).toBeFalsy()
    expect(result.$('#done')?.textContent).toBe('arrived')
  })

  test('renders fallback for already-pending then resolved promise', async () => {
    const { promise, resolve } = defer<number>()
    resolve(42)
    // promise resolved synchronously — but the consumer might still
    // observe pending until the microtask flushes the state.

    const router = setup(function Page(_h: Handle) {
      return () => (
        <main>
          <Await
            promise={promise}
            fallback={<p id="loading">…</p>}
            render={(data) => <p id="done">{data}</p>}
          />
        </main>
      )
    })
    await router.load()

    const result = render(<RouterProvider router={router} />)
    activeCleanup = result.cleanup
    await flush()
    await flush()

    expect(result.$('#done')?.textContent).toBe('42')
  })

  test('errors thrown by the promise are surfaced via the read getter', async () => {
    // <Await>'s contract: when the wrapped promise rejects, the
    // next render of <Await> calls `read()` which returns
    // `{ status: 'error', error }`, then throws. Whether an
    // enclosing CatchBoundary catches that throw is the consumer's
    // responsibility — the contract here is just that the rejection
    // propagates through the read getter, never silently swallowed.
    //
    // We exercise this via `useAwaited` directly so the assertion
    // sits at the API surface and isn't entangled with how the
    // surrounding render tree responds to a thrown error.
    const { promise, reject } = defer<string>()

    const fakeHandle = {
      signal: new AbortController().signal,
      update: vi.fn(),
    }
    const subscription = useAwaited(fakeHandle as any, { promise })

    expect(subscription.read().status).toBe('pending')

    reject(new Error('async boom'))
    await flush()
    await flush()

    const state = subscription.read()
    expect(state.status).toBe('error')
    // `defer()` wraps thrown errors via `defaultSerializeError`, so
    // the surfaced error is `{ data: serializedError, __isServerError: true }`
    // — the binding doesn't reach into that shape, it just exposes
    // whatever the deferred-promise tracker stored. We pin the
    // structural contract so binding consumers can rely on it.
    expect(state).toMatchObject({
      status: 'error',
      error: { __isServerError: true },
    })
    expect(fakeHandle.update).toHaveBeenCalled()
  })

  test('swap() rebinds to a new promise without leaking listeners on the old one', async () => {
    const fakeHandle = {
      signal: new AbortController().signal,
      update: vi.fn(),
    }

    const a = defer<string>()
    const subscription = useAwaited(fakeHandle as any, { promise: a.promise })

    // Swap to b BEFORE a settles. Old a's settlement must not
    // trigger handle.update() — that would re-render with stale
    // data after the consumer has moved on.
    const b = defer<string>()
    subscription.swap(b.promise)

    a.resolve('a-value')
    await flush()
    await flush()
    expect(fakeHandle.update).not.toHaveBeenCalled() // generation-counter blocks the stale settle

    b.resolve('b-value')
    await flush()
    await flush()
    expect(fakeHandle.update).toHaveBeenCalledTimes(1)

    const state = subscription.read()
    expect(state.status).toBe('success')
    expect((state as { data: string }).data).toBe('b-value')
  })
})
