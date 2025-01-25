import { useRouter, useRouterState, warning } from '@tanstack/react-router'
import { Asset } from './Asset'
import type { RouterManagedTag } from '@tanstack/react-router'

export const Scripts = () => {
  const router = useRouter()

  const assetScripts = useRouterState({
    select: (state) => {
      const assetScripts: Array<RouterManagedTag> = []
      const manifest = router.ssr?.manifest

      if (!manifest) {
        warning(false, '<Scripts /> found no manifest')
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
                attrs: asset.attrs,
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
        },
        children,
      })),
    }),
  })

  const allScripts = [...scripts, ...assetScripts] as Array<RouterManagedTag>

  return (
    <>
      {allScripts.map((asset, i) => (
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}
