import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

const data = { session: { user: 'test' } }

async function waitForOneMicrotask() {
  await Promise.resolve()
  return data
}

async function waitLonger() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return data
}

export const Route = createRootRoute({
  component: RootComponent,
  shellComponent: RootShell,
  ssr: false,
  loader: ({ location }) => {
    const delay = new URLSearchParams(location.searchStr).get('delay')
    if (delay === 'microtask') {
      return waitForOneMicrotask()
    }
    if (delay === 'longer') {
      return waitLonger()
    }
    return data
  },
})

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function RootComponent() {
  return (
    <main>
      <h1>Issue 8180 loader</h1>
      <Outlet />
    </main>
  )
}
