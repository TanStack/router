import * as Solid from 'solid-js'
import { getHydrateStatus } from '@tanstack/router-core'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag, ScriptFilter } from '@tanstack/router-core'

function applyFilter(
  filter: ScriptFilter | undefined,
  script: RouterManagedTag,
  ctx: { shouldHydrate: boolean },
): RouterManagedTag | null {
  return filter ? filter(script, ctx) : script
}

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

    const ctx = { shouldHydrate: hydrateStatus().shouldHydrate }
    const filter = router.options.scriptFilter

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

            const filtered = applyFilter(filter, withNonce, ctx)
            if (filtered) assetScripts.push(filtered)
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

    const ctx = { shouldHydrate: hydrateStatus().shouldHydrate }
    const filter = router.options.scriptFilter
    if (!filter) return allScripts

    return allScripts
      .map((s) => applyFilter(filter, s, ctx))
      .filter(Boolean) as Array<RouterManagedTag>
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
