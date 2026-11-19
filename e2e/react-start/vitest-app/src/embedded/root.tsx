import { Outlet, createRootRoute } from '@tanstack/react-router'
import { readSecret } from '../server-only'

// The root of a second route tree that is built by hand, for a part of the
// app that is embedded elsewhere. It is not in the routes directory, so the
// route generator never sees this module.
export const Route = createRootRoute({
  // Only the server uses the three options below.
  server: {
    handlers: {
      GET: () => new Response(readSecret()),
    },
  },
  headers: () => ({ 'x-secret-length': String(readSecret().length) }),
  ssr: 'data-only',
  component: EmbeddedRoot,
})

function EmbeddedRoot() {
  return (
    <main>
      <Outlet />
    </main>
  )
}
