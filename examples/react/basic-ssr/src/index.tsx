import * as React from 'react'

import { RegisteredRouter, RouterProvider } from '@tanstack/router'
import {
  LoaderClientProvider,
  RegisteredLoaderClient,
} from '@tanstack/react-loaders'

export function App({
  router,
  loaderClient,
  head,
}: {
  router: RegisteredRouter
  loaderClient: RegisteredLoaderClient
  head: string
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Vite App</title>
        <script src="https://cdn.tailwindcss.com" />
        {import.meta.env.SSR ? (
          <>
            <script
              className="__DEHYDRATED__"
              dangerouslySetInnerHTML={{
                __html: `</script>${head}<script class="__DEHYDRATED__">`,
              }}
            />
            <script
              className="__DEHYDRATED__"
              dangerouslySetInnerHTML={{
                __html: `
            for (const el of document.querySelectorAll('.__DEHYDRATED__')) {
              el.parentNode.removeChild(el)
            }
          `,
              }}
            />
          </>
        ) : null}
        {/* {import.meta.env.DEV ? ( */}
        {/* <> */}
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
        {/* <script type="module" src="/@vite/client" /> */}
        {/* </>
        ) : null} */}
        <script type="module" src="/src/entry-client.tsx"></script>
      </head>
      <body>
        <LoaderClientProvider loaderClient={loaderClient}>
          <RouterProvider router={router} />
        </LoaderClientProvider>
      </body>
    </html>
  )
}
