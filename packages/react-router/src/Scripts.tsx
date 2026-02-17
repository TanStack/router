import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

/**
 * Render body script tags collected from route matches and SSR manifests.
 * Should be placed near the end of the document body.
 */
export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  const activeMatches = useStore(router.activeMatchesStore, (matches) => matches)
  const assetScripts = React.useMemo(() => {
    const manifest = router.ssr?.manifest
    if (!manifest) {
      return []
    }

    const nextAssetScripts: Array<RouterManagedTag> = []
    activeMatches
      .map((match) => router.looseRoutesById[match.routeId]!)
      .forEach((route) =>
        manifest.routes[route.id]?.assets
          ?.filter((d) => d.tag === 'script')
          .forEach((asset) => {
            nextAssetScripts.push({
              tag: 'script',
              attrs: { ...asset.attrs, nonce },
              children: asset.children,
            } as any)
          }),
      )

    return nextAssetScripts
  }, [activeMatches, nonce, router])

  const scripts = React.useMemo(
    () =>
      (
        activeMatches
          .map((match) => match.scripts!)
          .flat(1)
          .filter(Boolean) as Array<RouterManagedTag>
      ).map(({ children, ...script }) => ({
        tag: 'script',
        attrs: {
          ...script,
          suppressHydrationWarning: true,
          nonce,
        },
        children,
      })),
    [activeMatches, nonce],
  )

  let serverBufferedScript: RouterManagedTag | undefined = undefined

  if (router.serverSsr) {
    serverBufferedScript = router.serverSsr.takeBufferedScripts()
  }

  const allScripts = [...scripts, ...assetScripts] as Array<RouterManagedTag>

  if (serverBufferedScript) {
    allScripts.unshift(serverBufferedScript)
  }

  return (
    <>
      {allScripts.map((asset, i) => (
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}
