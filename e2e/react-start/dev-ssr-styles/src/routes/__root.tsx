import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { useEffect } from 'react'
import '~/styles/app.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
  }),
  pendingComponent: () => null,
  component: RootComponent,
})

function RootComponent() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div data-testid="issue-8053-ssr-node" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__issue8053SsrNode ??= document.currentScript.previousElementSibling`,
          }}
        />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
