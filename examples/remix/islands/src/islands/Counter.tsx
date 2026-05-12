/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { clientEntry, on } from '@remix-run/ui'
import type { Handle } from '@remix-run/ui'

export const Counter = clientEntry(
  '/src/islands/Counter.tsx#Counter',
  function Counter(handle: Handle<{ initial?: number }>) {
    let count = handle.props.initial ?? 0
    return () => (
      <span
        style={{
          display: 'inline-flex',
          gap: '0.5rem',
          alignItems: 'center',
          padding: '0.25rem 0.5rem',
          border: '1px solid #888',
          borderRadius: 4,
        }}
      >
        <strong>Count:</strong> <code>{count}</code>
        <button
          type="button"
          mix={[
            on<HTMLButtonElement, 'click'>('click', () => {
              count++
              handle.update()
            }),
          ]}
        >
          +
        </button>
        <button
          type="button"
          mix={[
            on<HTMLButtonElement, 'click'>('click', () => {
              count = 0
              handle.update()
            }),
          ]}
        >
          reset
        </button>
      </span>
    )
  },
)
