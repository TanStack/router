import * as Solid from 'solid-js'
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/solid-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <Outlet />
    </>
  )
}
