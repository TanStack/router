import {
  RouterProvider,
  Scripts,
  ServerHeadContent,
} from '@tanstack/solid-router'
import { Hydration, HydrationScript, NoHydration, ssr } from 'solid-js/web'
import type { AnyRouter } from '@tanstack/solid-router'
import { MetaProvider, Title } from '@solidjs/meta'

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
