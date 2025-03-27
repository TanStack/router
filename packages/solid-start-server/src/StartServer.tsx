import { Asset, RouterProvider, Scripts, useTags } from '@tanstack/solid-router'
import {
  Hydration,
  NoHydration,
  useAssets,
} from 'solid-js/web'
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
  return (
    <RouterProvider
      router={props.router}
      InnerWrap={(props) => (
        <NoHydration>
          <MetaProvider>
            <ServerHeadContent />
            <Hydration>{props.children}</Hydration>
          </MetaProvider>
        </NoHydration>
      )}
    />
  )
}
