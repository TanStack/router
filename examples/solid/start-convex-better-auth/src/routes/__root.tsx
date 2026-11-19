/// <reference types="vite/client" />
import { HeadContent, Scripts, createRootRoute } from '@tanstack/solid-router'
import { Loading } from '@solidjs/web'
import { TanStackRouterDevtools } from '@tanstack/solid-router-devtools'
import type { JSX } from '@solidjs/web'
import appCss from '~/styles/app.css?url'
import AppConvexProvider from '~/providers/convex'
import { fetchAuth } from '~/library/server'

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  beforeLoad: async () => {
    const { session, token } = await fetchAuth()
    return { session, token }
  },
  shellComponent: RootDocument,
})

function RootDocument(props: { children: JSX.Element }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Loading>
          <AppConvexProvider>{props.children}</AppConvexProvider>
        </Loading>
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
