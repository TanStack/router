/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { on } from '@remix-run/ui'
import type { Handle } from '@remix-run/ui'

/**
 * Error component used by `/lab/*` routes. The render fn receives
 * `{ error, reset }` from the framework — `reset()` calls
 * `router.invalidate()` which retries loaders and clears the captured
 * error state.
 */
export function LabErrorComponent(
  _handle: Handle<{ error: unknown; reset: () => void }>,
) {
  return ({
    error,
    reset,
  }: {
    error: unknown
    reset: () => void
  }) => (
    <article style={{ border: '1px solid #c33', padding: '0.75rem' }}>
      <h2 style={{ color: '#c33', margin: 0 }}>Caught error</h2>
      <pre>{error instanceof Error ? error.message : String(error)}</pre>
      <button
        type="button"
        mix={[on<HTMLButtonElement, 'click'>('click', () => reset())]}
      >
        Retry
      </button>
    </article>
  )
}
