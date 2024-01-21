import { Router } from '@tanstack/react-router'
import * as React from 'react'
import { routeTree } from './routeTree.gen'
import { DehydrateRouter } from '@tanstack/react-router-server/client'

export function createRouter() {
  return new Router({
    routeTree,
    context: {
      head: '',
    },
    defaultPreload: 'intent',
    Wrap: ({ children }) => {
      return (
        <html lang="en">
          <head>
            <meta charSet="UTF-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1.0"
            />
            <title>Vite App</title>
            <script src="https://cdn.tailwindcss.com" />
            <script
              type="module"
              suppressHydrationWarning
              dangerouslySetInnerHTML={{
                __html: `
              import RefreshRuntime from "/@react-refresh"
              RefreshRuntime.injectIntoGlobalHook(window)
              window.$RefreshReg$ = () => {}
              window.$RefreshSig$ = () => (type) => type
              window.__vite_plugin_react_preamble_installed__ = true
            `,
              }}
            />
            <script type="module" src="/@vite/client" />
            <script type="module" src="/src/entry-client.tsx" />
          </head>
          <body>{children}</body>
        </html>
      )
    },
    InnerWrap: ({ children }) => {
      return (
        <>
          {children}
          <DehydrateRouter />
        </>
      )
    },
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
