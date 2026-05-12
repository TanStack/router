/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { clientEntry, on } from '@remix-run/ui'
import type { Handle } from '@remix-run/ui'

/**
 * An interactive `<a>` that:
 *  - Hovers light up with a "prefetched!" status (closure-captured state)
 *  - Click navigates via history.pushState (no full page reload)
 *
 * Whole thing lives in a `clientEntry()`. The wrapping island is the
 * minimum hydration unit — the surrounding page stays static HTML.
 */
export const LinkIsland = clientEntry(
  '/src/islands/LinkIsland.tsx#LinkIsland',
  function LinkIsland(handle: Handle<{ to: string; label: string }>) {
    let prefetched = false
    let visits = 0

    return ({ to, label }: { to: string; label: string }) => (
      <span>
        <a
          href={to}
          style={{
            color: prefetched ? '#0a7' : '#2563eb',
            textDecoration: 'underline',
          }}
          mix={[
            on<HTMLAnchorElement, 'pointerenter'>('pointerenter', () => {
              if (prefetched) return
              prefetched = true
              handle.update()
            }),
            on<HTMLAnchorElement, 'click'>('click', (e: MouseEvent) => {
              e.preventDefault()
              visits++
              history.pushState({}, '', to)
              handle.update()
            }),
          ]}
        >
          {label}
        </a>{' '}
        <small style={{ color: '#666' }}>
          ({prefetched ? 'prefetched' : 'idle'}; clicks: {visits})
        </small>
      </span>
    )
  },
)
