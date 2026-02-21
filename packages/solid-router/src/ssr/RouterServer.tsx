import { Hydration, HydrationScript, NoHydration, ssr } from '@solidjs/web'
// import { MetaProvider } from '@solidjs/meta'
import { RouterProvider } from '../RouterProvider'
import { Scripts } from '../Scripts'
import type { AnyRouter } from '@tanstack/router-core'

const docType = ssr('<!DOCTYPE html>')

export function RouterServer<TRouter extends AnyRouter>(props: {
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
                  {/* <MetaProvider> */}
                  <Hydration>{props.children}</Hydration>
                  <Scripts />
                  {/* </MetaProvider> */}
                </NoHydration>
              )}
            />
          </Hydration>
        </body>
      </html>
    </NoHydration>
  )
}
