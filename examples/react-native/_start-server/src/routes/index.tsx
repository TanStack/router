import * as React from 'react'
import { createRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

function HomePage() {
  return (
    <div>
      <h1>TanStack Router RN — Start Server</h1>
      <p>
        This Vite Start backend hosts the server functions consumed by the React
        Native examples (<code>bare</code> and <code>expo-dev-client</code>).
        Each function appears at <code>/_serverFn/&lt;sha256-id&gt;</code>.
      </p>

      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /_serverFn/&lt;listPosts-id&gt;</code> — returns the post
          list
        </li>
        <li>
          <code>GET /_serverFn/&lt;getPost-id&gt;</code> — returns a post by id
        </li>
      </ul>

      <p>
        Function ids are deterministic — the RN client and this server resolve
        the same id from the same source layout, so no manifest exchange is
        needed.
      </p>

      <h2>Run locally</h2>
      <pre>pnpm run dev # starts on http://localhost:3050</pre>

      <p>
        Then point your RN client's <code>serverFnBase</code> at{' '}
        <code>http://localhost:3050</code> (or your machine's LAN IP for a
        physical device) when you wire the Metro plugin.
      </p>
    </div>
  )
}
