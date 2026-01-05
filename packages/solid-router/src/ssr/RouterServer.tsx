import {
  Hydration,
  HydrationScript,
  NoHydration,
  ssr,
  useAssets,
} from 'solid-js/web'
import { Asset } from '../Asset'
import { useTags } from '../HeadContent'
import { RouterProvider } from '../RouterProvider'
import { Scripts } from '../Scripts'
import type { AnyRouter } from '@tanstack/router-core'

export function ServerHeadContent() {
  const tags = useTags()
  useAssets(() => {
    return (
      <>
        {tags().map((tag) => (
          <Asset {...tag} />
        ))}
      </>
    )
  })
  return null
}

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
