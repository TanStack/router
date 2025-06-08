import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router'

import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <HeadContent />
      <div class="p-2 flex gap-2 text-lg">
        <Link to="/">Index</Link>
        <Link to="/about">About</Link>
      </div>
      <Outlet />
      <Scripts />
    </>
  )
}
