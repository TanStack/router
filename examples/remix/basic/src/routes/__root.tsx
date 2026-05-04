/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { Link, Outlet, createRootRoute } from '@tanstack/remix-router'
import type { Handle } from '@remix-run/ui'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charset: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TanStack Router on Remix 3' },
    ],
  }),
  component: RootComponent,
})

/**
 * Root route component renders only the body content. The document
 * shell (`<html>/<head>/<body>` plus `<HeadContent>` and `<Scripts>`)
 * is owned by `<StartServer>` in `@tanstack/remix-start/server` so the
 * SSR tree's root is the shell but the client hydrates one level
 * deeper into `document.body`.
 */
function RootComponent(_handle: Handle) {
  return () => (
    <div
      style={{
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        maxWidth: '900px',
        margin: '0 auto',
        padding: '1rem',
        lineHeight: 1.5,
      }}
    >
      <nav
        style={{
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          padding: '0.5rem 0',
          borderBottom: '1px solid #ddd',
          marginBottom: '1rem',
        }}
      >
        <Link to="/">Home</Link>
        <Link to="/users">Users</Link>
        <Link to="/posts">Posts</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/catalog">Catalog</Link>
        <Link to="/lab/error">Lab</Link>
        <Link to="/slow">Slow</Link>
        <Link to="/deferred">Deferred</Link>
        <Link to="/guestbook">Guestbook</Link>
        <Link to="/counter">Counter</Link>
      </nav>
      <Outlet />
    </div>
  )
}
