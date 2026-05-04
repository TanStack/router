/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { clientEntry, on } from '@remix-run/ui'
import type { Handle } from '@remix-run/ui'

/**
 * Standalone client-hydrated component (a "client entry"). The first
 * argument is the entry id — the SSR pipeline emits a hydration marker
 * with this id, and the client runtime mounts JUST this component
 * against the marker. The rest of the page can stay non-interactive
 * static HTML.
 *
 * The id syntax `<module-url>#<export-name>` tells the runtime which
 * module to dynamically import and which export to instantiate. With
 * the Vite plugin in play the URL gets resolved to the deployed chunk
 * URL automatically.
 */
export const IslandCounter = clientEntry(
  '/src/components/IslandCounter.tsx#IslandCounter',
  function IslandCounter(handle: Handle<{ initial?: number; label?: string }>) {
    let count = handle.props.initial ?? 0
    return ({ initial: _ignored, label = 'Count' }: { initial?: number; label?: string }) => (
      <div
        style={{
          display: 'inline-block',
          padding: '0.5rem 0.75rem',
          border: '1px solid #888',
          borderRadius: 4,
        }}
      >
        <strong>{label}:</strong> <code>{count}</code>{' '}
        <button
          type="button"
          mix={[
            on<HTMLButtonElement, 'click'>('click', () => {
              count++
              void handle.update()
            }),
          ]}
        >
          +
        </button>{' '}
        <button
          type="button"
          mix={[
            on<HTMLButtonElement, 'click'>('click', () => {
              count = 0
              void handle.update()
            }),
          ]}
        >
          reset
        </button>
      </div>
    )
  },
)
