/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { Link, notFound, createFileRoute } from '@tanstack/remix-router'
import { Route as LabRoute } from './lab'
import type { Handle } from '@remix-run/ui'

function NotFoundShell(_handle: Handle<{ data?: unknown }>) {
  return () => (
    <article style={{ border: '1px solid #888', padding: '0.75rem' }}>
      <h2 style={{ margin: 0 }}>Not found (404)</h2>
      <p>The thing you asked for isn't there.</p>
      <p>
        <Link to="/">Home</Link>
      </p>
    </article>
  )
}

function ShouldNeverRender(_handle: Handle) {
  return () => <p>If you see this, notFound() didn't fire.</p>
}

/**
 * Loader calls `notFound()` — `<Match>` flips to `status: 'notFound'`
 * and picks the `notFoundComponent`. Demonstrates the same boundary
 * shape as `errorComponent`, but for the "expected absence" case.
 */
export const Route = createFileRoute('/lab/missing')({
  getParentRoute: () => LabRoute,
  path: '/lab/missing',
  loader: () => {
    throw notFound()
  },
  notFoundComponent: NotFoundShell,
  component: ShouldNeverRender,
})
