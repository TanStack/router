import * as Solid from 'solid-js'
import { _getAssetMatches, replaceEqualDeep } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  const scripts = Solid.createMemo(
    (previous: Array<RouterManagedTag> | undefined) => {
      const matches = _getAssetMatches(router.stores.matches.get())
      const next: Array<RouterManagedTag> = []
      const assets: Array<RouterManagedTag> = []
      const manifest = router.ssr?.manifest
      for (const match of matches) {
        for (const script of match.scripts ?? []) {
          if (!script) {
            continue
          }
          const { children, ...attrs } = script
          next.push({
            tag: 'script',
            attrs: { ...attrs, nonce },
            children: children as string | undefined,
          })
        }
        for (const asset of manifest?.routes[match.routeId]?.scripts ?? []) {
          assets.push({
            tag: 'script',
            attrs: { ...asset.attrs, nonce },
            children: asset.children,
          })
        }
      }
      next.push(...assets)
      return previous ? replaceEqualDeep(previous, next) : next
    },
  )
  const serverBufferedScript =
    (isServer ?? router.isServer) && router.serverSsr
      ? router.serverSsr.takeBufferedScripts()
      : undefined

  return (
    <>
      {serverBufferedScript && <Asset {...serverBufferedScript} />}
      <Solid.For each={scripts()}>{(asset) => <Asset {...asset} />}</Solid.For>
    </>
  )
}
