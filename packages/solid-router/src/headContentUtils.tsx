import * as Solid from 'solid-js'
import {
  buildMetaTags,
  dedupByLastKey,
  getAssetCrossOrigin,
  hashTag,
  isInlinableStylesheet,
  resolveManifestAssetLink,
  uniqBy,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type {
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

/**
 * Build the list of head/link/meta/script tags to render for active matches.
 * Used internally by `HeadContent`.
 */
export const useTags = (assetCrossOrigin?: AssetCrossOriginConfig) => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  const activeMatches = Solid.createMemo(() => router.stores.matches.get())
  const routeMeta = Solid.createMemo(() =>
    activeMatches()
      .map((match) => match.meta!)
      .filter(Boolean),
  )

  const meta: Solid.Accessor<Array<RouterManagedTag>> = Solid.createMemo(() =>
    buildMetaTags(routeMeta(), nonce),
  )

  const links = Solid.createMemo(() => {
    const matches = activeMatches()
    const constructed = dedupByLastKey(
      matches
        .map((match) => match.links!)
        .flat(1)
        .filter(Boolean) as Array<RouterManagedTag>,
    ).map((link) => {
      const { key, ...attrs } = link
      return {
        tag: 'link',
        attrs: {
          ...attrs,
          nonce,
        },
        key,
      }
    }) satisfies Array<RouterManagedTag>

    const manifest = router.ssr?.manifest

    const assets = matches
      .map((match) => manifest?.routes[match.routeId]?.assets ?? [])
      .filter(Boolean)
      .flat(1)
      .flatMap((asset): Array<RouterManagedTag> => {
        if (asset.tag === 'link') {
          if (isInlinableStylesheet(manifest, asset)) {
            return []
          }

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
              attrs: {
                ...asset.attrs,
                nonce,
              },
              children: asset.children,
              ...(asset.inlineCss ? { inlineCss: true as const } : {}),
            },
          ]
        }

        return []
      })

    return [...constructed, ...assets]
  })

  const preloadLinks = Solid.createMemo(() => {
    const matches = activeMatches()
    const preloadLinks: Array<RouterManagedTag> = []

    matches
      .map((match) => router.looseRoutesById[match.routeId]!)
      .forEach((route) =>
        router.ssr?.manifest?.routes[route.id]?.preloads
          ?.filter(Boolean)
          .forEach((preload) => {
            const preloadLink = resolveManifestAssetLink(preload)
            preloadLinks.push({
              tag: 'link',
              attrs: {
                rel: 'modulepreload',
                href: preloadLink.href,
                crossOrigin:
                  getAssetCrossOrigin(assetCrossOrigin, 'modulepreload') ??
                  preloadLink.crossOrigin,
                nonce,
              },
            })
          }),
      )

    return preloadLinks
  })

  const styles = Solid.createMemo(() =>
    dedupByLastKey(
      activeMatches()
        .map((match) => match.styles!)
        .flat(1)
        .filter(Boolean) as Array<RouterManagedTag>,
    ).map(({ children, key, ...attrs }) => ({
      tag: 'style',
      attrs: {
        ...attrs,
        nonce,
      },
      children,
      key,
    })),
  )

  const headScripts = Solid.createMemo(() =>
    dedupByLastKey(
      activeMatches()
        .map((match) => match.headScripts!)
        .flat(1)
        .filter(Boolean) as Array<RouterManagedTag>,
    ).map(({ children, key, ...script }) => ({
      tag: 'script',
      attrs: {
        ...script,
        nonce,
      },
      children,
      key,
    })),
  )

  return Solid.createMemo((prev: Array<RouterManagedTag> | undefined) => {
    const next = uniqBy(
      [
        ...meta(),
        ...preloadLinks(),
        ...links(),
        ...styles(),
        ...headScripts(),
      ] as Array<RouterManagedTag>,
      hashTag,
    )
    if (prev === undefined) {
      return next
    }
    return replaceEqualTags(prev, next)
  })
}

function replaceEqualTags(
  prev: Array<RouterManagedTag>,
  next: Array<RouterManagedTag>,
) {
  const prevByKey = new Map<string, RouterManagedTag>()
  for (const tag of prev) {
    prevByKey.set(hashTag(tag), tag)
  }

  let isEqual = prev.length === next.length
  const result = next.map((tag, index) => {
    const existing = prevByKey.get(hashTag(tag))
    if (existing) {
      if (existing !== prev[index]) {
        isEqual = false
      }
      return existing
    }

    isEqual = false
    return tag
  })

  return isEqual ? prev : result
}
