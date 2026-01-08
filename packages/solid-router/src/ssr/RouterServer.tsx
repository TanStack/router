import {
  Hydration,
  HydrationScript,
  NoHydration,
  ssr,
} from 'solid-js/web'
import { HeadStream } from '@unhead/solid-js/stream/server'
import { HeadContent } from '../HeadContent'
import { RouterProvider } from '../RouterProvider'
import { Scripts } from '../Scripts'
import type { JSXElement } from 'solid-js'
import type { AnyRouter } from '@tanstack/router-core'

const docType = ssr('<!DOCTYPE html>')

export function RouterServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  const headStream = HeadStream() as unknown as JSXElement
  return (
    <NoHydration>
      {docType as any}
      <html>
        <head>
          <HydrationScript />
          {headStream}
        </head>
        <body>
          <RouterServerBody router={props.router} />
        </body>
      </html>
    </NoHydration>
  )
}

export function RouterServerBody<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  return (
    <Hydration>
      <RouterProvider
        router={props.router}
        InnerWrap={(props) => (
          <NoHydration>
            <HeadContent />
            <Hydration>{props.children}</Hydration>
            <Scripts />
          </NoHydration>
        )}
      />
    </Hydration>
  )
}
