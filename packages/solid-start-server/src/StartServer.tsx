import {
  RouterProvider,
  Scripts,
  ServerHeadContent,
} from '@tanstack/solid-router'
import { Hydration, HydrationScript, NoHydration, ssr } from 'solid-js/web'
import { MetaProvider } from '@solidjs/meta'
import type { AnyRouter } from '@tanstack/solid-router'

const docType = ssr('<!DOCTYPE html>')

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  return (
    <NoHydration>
      {docType as any}
      <html>
        <head>
          <HydrationScript />
        </head>
        <body>
          <Hydration>
            <RouterProvider
              router={props.router}
              InnerWrap={(props) => (
                <NoHydration>
                  <MetaProvider>
                    <ServerHeadContent />
                    <Hydration>{props.children}</Hydration>
                    <Scripts />
                  </MetaProvider>
                </NoHydration>
              )}
            />
          </Hydration>
        </body>
      </html>
    </NoHydration>
  )
}
