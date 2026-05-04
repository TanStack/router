/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { TSR_DEFERRED_PROMISE, defer } from '@tanstack/router-core'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { DeferredPromise } from '@tanstack/router-core'

export interface AwaitOptions<T> {
  promise: Promise<T>
}

type DeferredState<T> = {
  status: 'pending' | 'success' | 'error'
  data?: T
  error?: unknown
}

function readDeferredState<T>(promise: Promise<T>): DeferredState<T> {
  const wrapped = promise as Promise<T> & {
    [TSR_DEFERRED_PROMISE]: DeferredPromise<T>[typeof TSR_DEFERRED_PROMISE]
  }
  const s = wrapped[TSR_DEFERRED_PROMISE]
  if (s.status === 'success') return { status: 'success', data: s.data }
  if (s.status === 'error') return { status: 'error', error: s.error }
  return { status: 'pending' }
}

export interface AwaitedSubscription<T> {
  /**
   * Read the current state. One of `'pending'`, `'success'` (with
   * `data`), or `'error'` (with `error`). Stable across renders — the
   * underlying promise reference is updated via `swap()`.
   */
  read: () => DeferredState<T>
  /**
   * Hot-swap the promise being subscribed to. Cheap; just rebinds the
   * settlement listener under a new generation number so the
   * previous promise's settlement (if it fires later) becomes a
   * no-op. Call this on every render with the latest promise so
   * components that re-derive deferred work (e.g. param-driven
   * fetches) don't leak stale subscriptions.
   */
  swap: (next: Promise<T>) => void
}

/**
 * Subscribe to a deferred promise. Returns `{ read, swap }`:
 *
 * - `read()` — yields `{ status: 'pending' }`, `{ status: 'success', data }`,
 *   or `{ status: 'error', error }`.
 * - `swap(promise)` — replace the wrapped promise without re-running
 *   setup. Use this when the promise identity changes between
 *   renders (e.g. a route loader returns a new deferred each
 *   navigation).
 *
 * The component re-renders via `handle.update()` when the promise
 * settles. A generation counter inside `useAwaited` ensures
 * settlement of an OLD promise (after `swap`) becomes a no-op — no
 * stale `handle.update()` calls.
 *
 * Mirrors `useAwaited` from `@tanstack/react-router`, minus the
 * Suspense-throwing path — `remix/ui` has no Suspense, so we expose
 * the status synchronously and let the caller branch.
 */
export function useAwaited<T>(
  handle: Handle<any, any>,
  { promise: input }: AwaitOptions<T>,
): AwaitedSubscription<T> {
  let currentPromise: Promise<T>
  let generation = 0

  function subscribe(p: Promise<T>) {
    const wrapped = defer(p) as Promise<T> & {
      [TSR_DEFERRED_PROMISE]: DeferredPromise<T>[typeof TSR_DEFERRED_PROMISE]
    }
    currentPromise = wrapped
    const myGen = ++generation
    if (wrapped[TSR_DEFERRED_PROMISE].status === 'pending') {
      const onSettle = () => {
        if (myGen === generation) handle.update()
      }
      wrapped.then(onSettle, onSettle)
    }
  }

  subscribe(input)

  return {
    read: () => readDeferredState<T>(currentPromise),
    swap: (next: Promise<T>) => {
      if (next !== currentPromise) subscribe(next)
    },
  }
}

export interface AwaitProps<T> extends AwaitOptions<T> {
  fallback?: RemixNode
  /**
   * Renderer for the resolved data. Use a regular prop instead of
   * `children` because Remix UI's JSX runtime can't convert
   * function-as-children to vnodes (it tries to flatten children into
   * vnodes before the component runs). Keep your existing
   * React-style `<Await>{(data) => ...}` callsite by passing `children`
   * via TypeScript cast — but the canonical surface is `render`.
   */
  render?: (data: T) => RemixNode
  /** @deprecated Use `render` instead — function-as-children isn't supported by Remix UI's vnode pipeline. */
  children?: ((data: T) => RemixNode) | RemixNode
}

/**
 * Component that renders `children(data)` once the promise resolves.
 * While pending, renders `fallback` (or nothing). On error, the error
 * is thrown so an enclosing `<CatchBoundary>` can show the error UI.
 *
 * Mirrors `<Await>` from `@tanstack/react-router`. Differences:
 *
 * - No `<Suspense>` — `remix/ui` doesn't have one. The fallback is
 *   rendered inline while pending.
 * - Re-renders are driven by `handle.update()` once the promise
 *   settles.
 */
export function Await<T>(handle: Handle<AwaitProps<T>>) {
  let subscription: AwaitedSubscription<T> | undefined

  return (props: AwaitProps<T>): RemixNode => {
    if (!subscription) {
      subscription = useAwaited(handle, { promise: props.promise })
    } else {
      // Hot-swap the wrapped promise without re-registering the whole
      // subscription. The generation counter inside `useAwaited`
      // ensures the old promise's settlement (if it fires later)
      // becomes a no-op.
      subscription.swap(props.promise)
    }
    const result = subscription.read()
    if (result.status === 'pending') {
      return (props.fallback ?? null) as RemixNode
    }
    if (result.status === 'error') {
      throw result.error
    }
    const data = result.data as T
    if (typeof props.render === 'function') return props.render(data)
    if (typeof props.children === 'function') {
      return (props.children as (d: T) => RemixNode)(data)
    }
    return (props.children ?? null) as RemixNode
  }
}
