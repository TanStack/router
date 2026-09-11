import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Field notes | Learn Start' },
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
  errorComponent: () => (
    <main>
      <h1>Could not load notes</h1>
      <a href="/">Try again</a>
    </main>
  ),
  notFoundComponent: () => (
    <main>
      <h1>Note not found</h1>
      <a href="/">All notes</a>
    </main>
  ),
})
