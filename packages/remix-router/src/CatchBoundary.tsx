/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { on } from '@remix-run/ui'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { RemixErrorRouteComponent } from './extensions'

export interface CatchBoundaryProps {
  /**
   * When the value returned by `getResetKey` changes, the captured error is
   * cleared. Typically tied to navigation (`router.stores.loadedAt`) so a new
   * route attempt resets the boundary.
   */
  getResetKey: () => number | string
  /** Component rendered when an error is captured. */
  errorComponent?: RemixErrorRouteComponent
  /** Side-effect callback invoked when an error is captured. */
  onCatch?: (error: Error, errorInfo: { componentStack: string }) => void
  children?: RemixNode
}

/**
 * Catches synchronous errors thrown during the render of `children` and
 * shows `errorComponent` instead. Mirrors `<CatchBoundary>` from
 * `@tanstack/react-router`, with these differences imposed by the
 * `remix/ui` runtime:
 *
 * - Async errors (those thrown by event handlers, microtasks, etc.) are
 *   caught via the runtime's `'error'` event channel rather than fiber
 *   propagation. Pair with the runtime-level error reporter.
 * - "Reset" works by toggling the captured error when `getResetKey()`
 *   changes value across renders.
 */
export function CatchBoundary(handle: Handle<CatchBoundaryProps>) {
  let captured: Error | null = null
  let lastResetKey: number | string | undefined

  // Listen for runtime errors that escape render scope (event handlers,
  // promises) so they surface here too. Disconnect when the boundary
  // unmounts.
  const off = handle.frame.addEventListener('error', (event: Event) => {
    const e = event as Event & { error?: unknown }
    if (e.error instanceof Error) {
      captured = e.error
      void handle.update()
    }
  })
  if (typeof off === 'function') {
    handle.signal.addEventListener('abort', off, { once: true })
  }

  return (props: CatchBoundaryProps): RemixNode => {
    const key = props.getResetKey()
    if (lastResetKey === undefined) lastResetKey = key
    else if (key !== lastResetKey) {
      captured = null
      lastResetKey = key
    }

    if (captured) {
      const ErrorComp = props.errorComponent ?? ErrorComponent
      props.onCatch?.(captured, { componentStack: '' })
      return (
        <ErrorComp
          error={captured}
          reset={() => {
            captured = null
            void handle.update()
          }}
          info={{ componentStack: '' }}
        />
      )
    }

    try {
      return <>{props.children}</>
    } catch (err) {
      captured = err instanceof Error ? err : new Error(String(err))
      void handle.update()
      return null
    }
  }
}

/**
 * Default error component matching the React binding's UI. Includes a small
 * "Show Error" toggle.
 */
export function ErrorComponent(handle: Handle<{ error: any }>) {
  let show = process.env.NODE_ENV !== 'production'

  return ({ error }: { error: any }): RemixNode => {
    const onToggle = () => {
      show = !show
      void handle.update()
    }
    return (
      <div style="padding:.5rem;max-width:100%">
        <div style="display:flex;align-items:center;gap:.5rem">
          <strong style="font-size:1rem">Something went wrong!</strong>
          <button
            type="button"
            mix={[on<HTMLButtonElement, 'click'>('click', onToggle)]}
            style="appearance:none;font-size:.6em;border:1px solid currentColor;padding:.1rem .2rem;font-weight:bold;border-radius:.25rem"
          >
            {show ? 'Hide Error' : 'Show Error'}
          </button>
        </div>
        <div style="height:.25rem" />
        {show ? (
          <pre style="font-size:.7em;border:1px solid red;border-radius:.25rem;padding:.3rem;color:red;overflow:auto">
            {(error as { message?: string })?.message ?? String(error)}
          </pre>
        ) : null}
      </div>
    )
  }
}
