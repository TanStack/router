import * as React from 'react'
import {
  Link,
  Outlet,
  ScrollRestoration,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <Nav type="header" />
      <hr />
      <Outlet />
      <hr />
      <Nav type="footer" />
      <ScrollRestoration />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}

function Nav({ type }: { type: 'header' | 'footer' }) {
  const Elem = type === 'header' ? 'header' : 'footer'
  const prefix = type === 'header' ? 'Head' : 'Foot'
  return (
    <Elem className="p-2 flex gap-2 text-lg">
      <Link
        to="/"
        activeProps={{
          className: 'font-bold',
        }}
        activeOptions={{ exact: true }}
      >
        {prefix}-/
      </Link>{' '}
      {(
        [
          '/normal-page',
          '/lazy-page',
          '/virtual-page',
          '/lazy-with-loader-page',
        ] as const
      ).map((href, i) => (
        <Link
          key={`${prefix}-${href}-${i}`}
          to={href}
          activeProps={{
            className: 'font-bold',
          }}
        >
          {prefix}-{href}
        </Link>
      ))}
    </Elem>
  )
}
