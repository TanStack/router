import * as Solid from 'solid-js'
import { getHydrateStatus, stripClientEntryImport } from '@tanstack/router-core'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  const activeMatches = Solid.createMemo(() => router.stores.matches.get())

  const hydrateStatus = Solid.createMemo(() =>
    getHydrateStatus(activeMatches(), router),
  )

  const assetScripts = Solid.createMemo(() => {
    const assetScripts: Array<RouterManagedTag> = []
    const manifest = router.ssr?.manifest

    if (!manifest) {
      return []
    }

    const { shouldHydrate } = hydrateStatus()

    activeMatches()
      .map((match) => router.looseRoutesById[match.routeId]!)
      .forEach((route) =>
        manifest.routes[route.id]?.assets
          ?.filter((d) => d.tag === 'script')
          .forEach((asset) => {
            const withNonce = {
              tag: 'script',
              attrs: { ...asset.attrs, nonce },
              children: asset.children,
            } as RouterManagedTag

            if (!shouldHydrate) {
              const normalized = stripClientEntryImport(withNonce)
              if (normalized) {
                assetScripts.push(normalized)
              }
              return
            }

            assetScripts.push(withNonce)
          }),
      )

    return assetScripts
  })

  const scripts = Solid.createMemo(() => {
    const allScripts = (
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
    })) as Array<RouterManagedTag>

    const { shouldHydrate } = hydrateStatus()
    if (!shouldHydrate) {
      return allScripts
        .map(stripClientEntryImport)
        .filter(Boolean) as Array<RouterManagedTag>
    }

    return allScripts
  })

  Solid.createEffect(() => {
    if (process.env.NODE_ENV !== 'production' && hydrateStatus().hasConflict) {
      console.warn(
        '[TanStack Router] Conflicting `hydrate` options detected in route matches: ' +
          'some routes set `hydrate: false` while others set `hydrate: true`. ' +
          'The page will not hydrate. Align route `hydrate` settings to silence this warning.',
      )
    }
  })

  let serverBufferedScript: RouterManagedTag | undefined = undefined

  if (router.serverSsr && hydrateStatus().shouldHydrate) {
    serverBufferedScript = router.serverSsr.takeBufferedScripts()
  }

  const allScripts = [
    ...scripts(),
    ...assetScripts(),
  ] as Array<RouterManagedTag>

  if (serverBufferedScript) {
    allScripts.unshift(serverBufferedScript)
  }

  return (
    <>
      {allScripts.map((asset, i) => (
        <Asset {...asset} />
      ))}
    </>
  )
}
