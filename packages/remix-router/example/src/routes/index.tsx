import { createRoute } from '@tanstack/remix-router'
import { Route as RootRoute } from './__root'
import type { Handle } from '@remix-run/ui'

function HomeComponent(_handle: Handle) {
  return () => (
    <main>
      <h1>TanStack Router on Remix 3</h1>
      <p>
        This page is rendered by <code>@tanstack/remix-router</code>'s
        <code>&lt;RouterProvider&gt;</code>, mounted in a
        <code> @remix-run/ui</code> tree, served by
        <code> @remix-run/fetch-router</code>.
      </p>
    </main>
  )
}

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: HomeComponent,
})
