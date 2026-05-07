/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { Counter } from './islands/Counter'
import { LinkIsland } from './islands/LinkIsland'
import type { Handle } from '@remix-run/ui'

/**
 * Mostly-static page. Demonstrates idiomatic Remix 3:
 *   - The page itself is *not* a `clientEntry`. It runs server-side once,
 *     produces HTML, and never hydrates on the client.
 *   - `<LinkIsland>` and `<Counter>` are `clientEntry()`-wrapped — the only
 *     bits that become interactive after page load.
 *   - Open devtools and inspect: the surrounding `<h1>`, `<p>`, `<ul>` etc.
 *     have zero JS attached. View source: you'll see `<!-- rmx:h:... -->`
 *     comments around the islands and nowhere else.
 */
export function Page(_handle: Handle) {
  return () => (
    <div
      style={{
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        maxWidth: 720,
        margin: '0 auto',
        padding: '2rem 1rem',
        lineHeight: 1.6,
      }}
    >
        <h1>Static HTML, hydrated islands</h1>

        <p>
          This page is server-rendered as static HTML. The only parts that
          become interactive on the client are the <code>clientEntry()</code>{' '}
          islands embedded inline.
        </p>

        <h2>Hydrated link</h2>
        <p>
          Clicking does SPA-style <code>history.pushState</code> instead of a
          full reload. Hovering "prefetches" (visualised with a colour change).
          The surrounding paragraph text is static HTML — it has no event
          handlers attached.
        </p>
        <p>
          Go to: <LinkIsland to="/about" label="About" />
        </p>
        <p>
          Or visit: <LinkIsland to="/contact" label="Contact" />
        </p>

        <h2>Hydrated counter</h2>
        <p>
          Same idea. The <code>+</code> button increments closure-captured
          state, calls <code>handle.update()</code>, the island re-renders.
          The text around it stays as plain HTML.
        </p>
        <p>
          <Counter initial={0} />
        </p>

        <h2>What hydrates</h2>
        <ul>
          <li>
            Each island is wrapped in{' '}
            <code>{'<!-- rmx:h:id --> ... <!-- /rmx:h -->'}</code> comment
            markers in the HTML source.
          </li>
          <li>
            On the client, <code>run()</code> walks the document, finds those
            markers, and hydrates only those regions.
          </li>
          <li>
            Everything else is treated as inert HTML. No vDOM diff, no event
            wiring, no closure setup — server bytes only.
          </li>
        </ul>

        <p style={{ color: '#666', fontSize: '0.9em', marginTop: '2rem' }}>
          Stack: <code>@remix-run/ui</code> + Vite SSR. No router, no client
          framework wrapper. The whole client bundle is ~<code>10kB</code> gz
          plus the two island modules.
        </p>
    </div>
  )
}
