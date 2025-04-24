import { createRootRoute, Link, Outlet } from '@tanstack/solid-router'
import appCss from '~/styles/app.css?url'
import * as Solid from 'solid-js'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootDocument,
})

function RootDocument({ children }: { children: Solid.JSX.Element }) {
  return (
    <>
      <div class="p-2 flex gap-2 text-lg">
        <Link to="/">Index</Link>
        <Link to="/about">About</Link>
      </div>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}
