import { HeadContent, Scripts, createRootRoute } from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import type { JSX } from 'solid-js'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'TanStack Solid Start Bun Bundler' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: JSX.Element }) {
  return (
    <html lang="en">
      <head>
        <HydrationScript />
      </head>
      <body>
        <HeadContent />
        {children}
        <Scripts />
      </body>
    </html>
  )
}
