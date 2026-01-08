import { Hydration, NoHydration, ssr } from 'solid-js/web'
import { HeadContent } from '../HeadContent'
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
      <RouterProvider
        router={props.router}
        InnerWrap={(innerProps) => (
          <html>
            <head>
              <Hydration>
                <HeadContent />
              </Hydration>
            </head>
            <body>
              <Hydration>
                {innerProps.children}
                <Scripts />
              </Hydration>
            </body>
          </html>
        )}
      />
    </NoHydration>
  )
}
