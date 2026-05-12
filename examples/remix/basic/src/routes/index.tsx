/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { Link, createFileRoute } from '@tanstack/remix-router'
import { Route as RootRoute } from './__root'
import type { Handle } from '@remix-run/ui'

function HomePage(_handle: Handle) {
  return () => (
    <main>
      <h1>TanStack Router on Remix 3</h1>
      <p>
        TanStack Router driving the routing layer; <code>@remix-run/ui</code>{' '}
        as the rendering runtime; <code>@tanstack/remix-start</code> for the
        full-stack pieces (server entry, server functions, vite plugin).
        The whole route tree hydrates as one Remix UI mount.
      </p>

      <h2>Try the routes</h2>
      <ul>
        <li>
          <Link to="/users">Users</Link> — loader-driven list with a nested
          detail route via <code>&lt;Outlet /&gt;</code>.
        </li>
        <li>
          <Link to="/posts">Posts</Link> — loader returns metadata; detail
          route calls a server function that runs <code>marked</code> and{' '}
          <code>highlight.js</code> server-side, then mounts the HTML via{' '}
          <code>innerHTML</code>.
        </li>
        <li>
          <Link to="/admin">Admin</Link> — 4-deep nested layout via the file
          path <code>admin.users.$userId.sessions.$sessionId</code>.
        </li>
        <li>
          <Link to="/catalog">Catalog</Link> — search params driving the
          loader: <code>validateSearch</code>, <code>loaderDeps</code>,{' '}
          <code>useSearch</code>, <code>&lt;Link search=&#123;updater&#125;
          /&gt;</code>, and a form action that calls <code>useNavigate</code>.
        </li>
        <li>
          <Link to="/slow">Slow</Link> — async loader with a{' '}
          <code>pendingComponent</code> fallback.
        </li>
        <li>
          <Link to="/lab/error">Lab → error</Link>,{' '}
          <Link to="/lab/missing">missing</Link>,{' '}
          <Link to="/lab/render-error">render-error</Link> — the three error
          paths: loader throw, <code>notFound()</code>, and render-time throw
          caught by a <code>&lt;CatchBoundary /&gt;</code>.
        </li>
        <li>
          <Link to="/guestbook">Guestbook</Link> — <code>createServerFn(&#123;
          method: 'POST' &#125;)</code> with <code>.inputValidator()</code>;
          the form's <code>on('submit')</code> calls the server fn directly.
        </li>
        <li>
          <Link to="/counter">Counter</Link> — a <code>clientEntry()</code>{' '}
          island embedded in an otherwise inert route component.
        </li>
      </ul>
    </main>
  )
}

export const Route = createFileRoute('/')({
  getParentRoute: () => RootRoute,
  path: '/',
  component: HomePage,
})
