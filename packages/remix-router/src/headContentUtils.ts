import {
  escapeHtml,
  getAssetCrossOrigin,
  isInlinableStylesheet,
  resolveManifestAssetLink,
} from '@tanstack/router-core'
import type {
  AnyRouter,
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

/**
 * Compute the de-duplicated array of head tags for the current matches.
 *
 * Pure function — call from a render fn after subscribing to
 * `router.stores.matches`. Mirrors `useTags` from `@tanstack/react-router`,
 * minus the per-section memoization (recomputation is cheap and the
 * `remix/ui` reconciler diffs the rendered tags efficiently).
 */
export function buildHeadTags(
  router: AnyRouter,
  assetCrossOrigin?: AssetCrossOriginConfig,
): Array<RouterManagedTag> {
  const nonce = router.options.ssr?.nonce
  const matches = router.stores.matches.get()

  const routeMeta = matches.map((m: any) => m.meta).filter(Boolean)

  const resultMeta: Array<RouterManagedTag> = []
  const metaByAttribute: Record<string, true> = {}
  let title: RouterManagedTag | undefined

  for (let i = routeMeta.length - 1; i >= 0; i--) {
    const metas = routeMeta[i] as Array<any>
    for (let j = metas.length - 1; j >= 0; j--) {
      const m = metas[j]
      if (!m) continue

      if (m.title) {
        if (!title) title = { tag: 'title', children: m.title }
      } else if ('script:ld+json' in m) {
        try {
          const json = JSON.stringify(m['script:ld+json'])
          resultMeta.push({
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: escapeHtml(json),
          })
        } catch {
          // skip invalid JSON-LD
        }
      } else {
        const attribute = m.name ?? m.property
        if (attribute) {
          if (metaByAttribute[attribute]) continue
          metaByAttribute[attribute] = true
        }
        resultMeta.push({ tag: 'meta', attrs: { ...m, nonce } })
      }
    }
  }

  if (title) resultMeta.push(title)
  if (nonce) {
    resultMeta.push({
      tag: 'meta',
      attrs: { property: 'csp-nonce', content: nonce },
    })
  }
  resultMeta.reverse()

  const constructedLinks: Array<RouterManagedTag> = matches
    .map((m: any) => m.links)
    .filter(Boolean)
    .flat(1)
    .map((link: any) => ({ tag: 'link', attrs: { ...link, nonce } }))

  const manifest = router.ssr?.manifest
  const assetLinks = matches
    .map((m: any) => manifest?.routes[m.routeId]?.assets ?? [])
    .filter(Boolean)
    .flat(1)
    .flatMap((asset: any): Array<RouterManagedTag> => {
      if (asset.tag === 'link') {
        if (isInlinableStylesheet(manifest, asset)) return []
        return [
          {
            tag: 'link',
            attrs: {
              ...asset.attrs,
              crossOrigin:
                getAssetCrossOrigin(assetCrossOrigin, 'stylesheet') ??
                asset.attrs?.crossOrigin,
              nonce,
            },
          },
        ]
      }
      if (asset.tag === 'style') {
        return [
          {
            tag: 'style',
            attrs: { ...asset.attrs, nonce },
            children: asset.children,
            ...(asset.inlineCss ? { inlineCss: true as const } : {}),
          },
        ]
      }
      return []
    })

  const preloadLinks: Array<RouterManagedTag> = []
  matches
    .map((m: any) => router.looseRoutesById[m.routeId])
    .forEach((route: any) =>
      router.ssr?.manifest?.routes[route?.id]?.preloads
        ?.filter(Boolean)
        .forEach((preload: any) => {
          const link = resolveManifestAssetLink(preload)
          preloadLinks.push({
            tag: 'link',
            attrs: {
              rel: 'modulepreload',
              href: link.href,
              crossOrigin:
                getAssetCrossOrigin(assetCrossOrigin, 'modulepreload') ??
                link.crossOrigin,
              nonce,
            },
          })
        }),
    )

  const styles = matches
    .map((m: any) => m.styles)
    .flat(1)
    .filter(Boolean)
    .map(({ children, ...attrs }: any) => ({
      tag: 'style',
      attrs: { ...attrs, nonce },
      children,
    })) as Array<RouterManagedTag>

  const headScripts = matches
    .map((m: any) => m.headScripts)
    .flat(1)
    .filter(Boolean)
    .map(({ children, ...script }: any) => ({
      tag: 'script',
      attrs: { ...script, nonce },
      children,
    })) as Array<RouterManagedTag>

  return uniqBy(
    [
      ...resultMeta,
      ...preloadLinks,
      ...constructedLinks,
      ...assetLinks,
      ...styles,
      ...headScripts,
    ],
    (t) => JSON.stringify(t),
  )
}

export function uniqBy<T>(arr: Array<T>, fn: (item: T) => string): Array<T> {
  const seen = new Set<string>()
  return arr.filter((item) => {
    const key = fn(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
