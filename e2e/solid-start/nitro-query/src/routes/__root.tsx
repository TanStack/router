/// <reference types="vite/client" />
import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import type { QueryClient } from '@tanstack/solid-query'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  shellComponent: RootDocument,
})

function RootDocument(props: { children?: any }) {
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  )
}
