import { Asset } from './Asset'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

/**
 * Render body script tags collected from route matches and SSR manifests.
 * Should be placed near the end of the document body.
 */
/**
 * Render body script tags collected from route matches and SSR manifests.
 * Should be placed near the end of the document body.
 */
export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  const assetScripts = useRouterState({
    select: (state) => {
      const assetScripts: Array<RouterManagedTag> = []
      const manifest = router.ssr?.manifest

      if (!manifest) {
        return []
      }

      state.matches
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
    },
    structuralSharing: true as any,
  })

  const { scripts } = useRouterState({
    select: (state) => ({
      scripts: (
        state.matches
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
    }),
    structuralSharing: true as any,
  })

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
