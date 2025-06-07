import { Asset, RouterProvider, useTags } from '@tanstack/solid-router'
import { useAssets } from 'solid-js/web'
import { MetaProvider } from '@solidjs/meta'
import type { AnyRouter } from '@tanstack/router-core'

export function ServerHeadContent() {
  const tags = useTags()
  useAssets(() => {
    return (
      <MetaProvider>
        {tags().map((tag) => (
          <Asset {...tag} />
        ))}
      </MetaProvider>
    )
  })
  return null
}

export function StartServer<TRouter extends AnyRouter>(props: {
  router: TRouter
}) {
  return <RouterProvider router={props.router} />
}
