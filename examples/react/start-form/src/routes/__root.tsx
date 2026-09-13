import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Reading goal | TanStack Form' },
    ],
  }),
  shellComponent: ({ children }: { children: ReactNode }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
  notFoundComponent: () => (
    <main>
      <h1>Page not found</h1>
      <a href="/">Home</a>
    </main>
  ),
})
