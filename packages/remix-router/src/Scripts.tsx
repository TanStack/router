/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { useRouter } from './useRouter'
import { subscribeStore } from './subscribe'
import { Asset } from './Asset'
import type { Handle, RemixNode } from '@remix-run/ui'
import type { AnyRouter, RouterManagedTag } from '@tanstack/router-core'

function getAssetScripts(
  router: AnyRouter,
  matches: Array<any>,
  nonce: string | undefined,
): Array<RouterManagedTag> {
  const manifest = router.ssr?.manifest
  if (!manifest) return []
  const out: Array<RouterManagedTag> = []
  matches
    .map((m) => router.looseRoutesById[m.routeId])
    .forEach((route: any) =>
      manifest.routes[route?.id]?.assets
        ?.filter((d: any) => d.tag === 'script')
        .forEach((asset: any) => {
          out.push({
            tag: 'script',
            attrs: { ...asset.attrs, nonce },
            children: asset.children,
          })
        }),
    )
  return out
}

function getRouteScripts(
  matches: Array<any>,
  nonce: string | undefined,
): Array<RouterManagedTag> {
  return matches
    .map((m) => m.scripts)
    .flat(1)
    .filter(Boolean)
    .map(({ children, ...script }: any) => ({
      tag: 'script' as const,
      attrs: { ...script, nonce },
      children,
    }))
}

/**
 * Render body script tags collected from route matches and the SSR manifest.
 * Place near the end of the document body (after `<RouterProvider>`).
 *
 * Note: we render `<Asset>` calls without spreading the `RouterManagedTag`
 * because TypeScript's JSX transform falls back to classic
 * `createElement` whenever a `key` follows a `{...spread}` — and Remix
 * UI's `createElement` unconditionally overwrites `props.children` with
 * the rest args (an empty array when no JSX children), wiping the
 * inline-script body. Passing props explicitly keeps the automatic
 * `jsx()` runtime in play.
 */
export function Scripts(handle: Handle) {
  const router = useRouter(handle)
  void subscribeStore(handle, router.stores.matches)

  return (): RemixNode => {
    const nonce = router.options.ssr?.nonce
    const matches = router.stores.matches.get()
    const scripts = getRouteScripts(matches, nonce)
    const assetScripts = getAssetScripts(router, matches, nonce)
    const all = [...scripts, ...assetScripts]

    let buffered: RouterManagedTag | undefined
    if (router.serverSsr?.takeBufferedScripts) {
      buffered = router.serverSsr.takeBufferedScripts()
    }
    if (buffered) all.unshift(buffered)

    return (
      <>
        {all.map((asset, i) => (
          <Asset
            tag={asset.tag as any}
            attrs={asset.attrs}
            children={asset.children}
            key={`tsr-scripts-${asset.tag}-${i}`}
          />
        ))}
      </>
    )
  }
}
