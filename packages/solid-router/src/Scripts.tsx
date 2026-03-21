import { NoHydration } from '@solidjs/web'
import * as Solid from 'solid-js'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  const activeMatches = Solid.createMemo(
    () => router.stores.activeMatchesSnapshot.state,
  )
  const assetScripts = Solid.createMemo(() => {
    const assetScripts: Array<RouterManagedTag> = []
    const manifest = router.ssr?.manifest

    if (!manifest) {
      return []
    }

    activeMatches()
      .map((match) => router.looseRoutesById[match.routeId]!)
      .forEach((route) =>
        manifest.routes[route.id]?.assets
          ?.filter((d) => d.tag === 'script')
          .forEach((asset) => {
            assetScripts.push({
              tag: 'script',
              attrs: { ...asset.attrs, nonce },
              children: asset.children,
            } as any)
          }),
      )

    return assetScripts
  })

  const scripts = Solid.createMemo(() =>
    (
      activeMatches()
        .map((match) => match.scripts!)
        .flat(1)
        .filter(Boolean) as Array<RouterManagedTag>
    ).map(({ children, ...script }) => ({
      tag: 'script',
      attrs: {
        ...script,
        nonce,
      },
      children,
    })),
  )

  const serverBufferedScript: RouterManagedTag | undefined = router.serverSsr
    ? router.serverSsr.takeBufferedScripts()
    : undefined

  const allScripts = Solid.createMemo(() => {
    const result = [...scripts(), ...assetScripts()] as Array<RouterManagedTag>

    if (serverBufferedScript) {
      result.unshift(serverBufferedScript)
    }

    return result
  })

  return (
    <NoHydration>
      <Solid.For each={allScripts()}>
        {(asset) => {
          const a = Solid.untrack(asset)
          return <Asset {...(a)} />
        }}
      </Solid.For>
    </NoHydration>
  )
}
