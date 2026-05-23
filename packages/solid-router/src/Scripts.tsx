import * as Solid from 'solid-js'
import { isServer } from '@tanstack/router-core/isServer'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  const getAssetScripts = (matches: Array<any>) => {
    const assetScripts: Array<RouterManagedTag> = []
    const manifest = router.ssr?.manifest

    if (!manifest) {
      return []
    }

      matches
        .map((match) => router.looseRoutesById[match.routeId]!)
        .forEach((route) => {
        const routeManifest = manifest.routes[route.id]

        routeManifest?.assets
          ?.filter((d) => d.tag === 'script')
          .forEach((asset) => {
            const scriptAsset = {
              tag: 'script',
              attrs: { ...asset.attrs, nonce },
              children: asset.children,
            } satisfies RouterManagedTag

            assetScripts.push(scriptAsset)
          })
      })

    return assetScripts
  }

  const getScripts = (matches: Array<any>): Array<RouterManagedTag> =>
    (
      matches
        .map((match) => match.scripts!)
        .flat(1)
        .filter(Boolean) as Array<RouterManagedTag>
    ).map(
      ({ children, ...script }) =>
        ({
          tag: 'script',
          attrs: {
            ...script,
            nonce,
          },
          children,
        }) satisfies RouterManagedTag,
    )

  const activeMatches = Solid.createMemo(() => router.stores.matches.get())
  const assetScripts = Solid.createMemo(() => getAssetScripts(activeMatches()))
  const scripts = Solid.createMemo(() => getScripts(activeMatches()))

  return renderScripts(router, scripts(), assetScripts())
}

function renderScripts(
  router: ReturnType<typeof useRouter>,
  scripts: Array<RouterManagedTag>,
  assetScripts: Array<RouterManagedTag>,
) {
  const allScripts = [
    ...scripts,
    ...assetScripts,
  ] as Array<RouterManagedTag>

  if ((isServer ?? router.isServer) && router.serverSsr) {
    const serverBufferedScript = router.serverSsr.takeBufferedScripts()
    if (serverBufferedScript) {
      allScripts.unshift(serverBufferedScript)
    }
  }

  return (
    <>
      {allScripts.map((asset, i) => (
        <Asset {...asset} />
      ))}
    </>
  )
}
