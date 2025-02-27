import {
  RouterProvider,
  Scripts,
  ServerHeadContent,
} from '@tanstack/solid-router'
import { Hydration, HydrationScript, NoHydration, ssr } from 'solid-js/web'
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
                  <ServerHeadContent />
                  <Hydration>{props.children}</Hydration>
                  <Scripts />
                </NoHydration>
              )}
            />
          </Hydration>
        </body>
      </html>
    </NoHydration>
  )
}
