import * as Vue from 'vue'
import {
  buildMetaTags,
  dedupByLastKey,
  getAssetCrossOrigin,
  hashTag,
  isInlinableStylesheet,
  resolveManifestAssetLink,
  uniqBy,
} from '@tanstack/router-core'
import { useStore } from '@tanstack/vue-store'
import { useRouter } from './useRouter'
import type {
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

export const useTags = (assetCrossOrigin?: AssetCrossOriginConfig) => {
  const router = useRouter()
  const matches = useStore(router.stores.matches, (value) => value)

  const meta = Vue.computed<Array<RouterManagedTag>>(() =>
    buildMetaTags(matches.value.map((match) => match.meta!).filter(Boolean)),
  )

  const links = Vue.computed<Array<RouterManagedTag>>(
    () =>
      dedupByLastKey(
        matches.value
          .map((match) => match.links!)
          .flat(1)
          .filter(Boolean) as Array<RouterManagedTag>,
      ).map((link) => {
        const { key, ...attrs } = link
        return {
          tag: 'link',
          attrs: {
            ...attrs,
          },
          key,
        }
      }) as Array<RouterManagedTag>,
  )

  const preloadMeta = Vue.computed<Array<RouterManagedTag>>(() => {
    const preloadMeta: Array<RouterManagedTag> = []

    matches.value
      .map((match) => router.looseRoutesById[match.routeId]!)
      .forEach((route) =>
        router.ssr?.manifest?.routes[route.id]?.preloads
          ?.filter(Boolean)
          .forEach((preload) => {
            const preloadLink = resolveManifestAssetLink(preload)
            preloadMeta.push({
              tag: 'link',
              attrs: {
                rel: 'modulepreload',
                href: preloadLink.href,
                crossOrigin:
                  getAssetCrossOrigin(assetCrossOrigin, 'modulepreload') ??
                  preloadLink.crossOrigin,
              },
            })
          }),
      )

    return preloadMeta
  })

  const headScripts = Vue.computed<Array<RouterManagedTag>>(() =>
    dedupByLastKey(
      matches.value
        .map((match) => match.headScripts!)
        .flat(1)
        .filter(Boolean) as Array<RouterManagedTag>,
    ).map(({ children, key, ...script }) => ({
      tag: 'script',
      attrs: {
        ...script,
      },
      children,
      key,
    })),
  )

  const manifestAssets = Vue.computed<Array<RouterManagedTag>>(() => {
    const manifest = router.ssr?.manifest

    const assets = matches.value
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
              },
            },
          ]
        }

        if (asset.tag === 'style') {
          return [
            {
              tag: 'style',
              attrs: asset.attrs,
              children: asset.children,
              ...(asset.inlineCss ? { inlineCss: true as const } : {}),
            },
          ]
        }

        return []
      })

    return assets
  })

  return () =>
    uniqBy(
      [
        ...manifestAssets.value,
        ...meta.value,
        ...preloadMeta.value,
        ...links.value,
        ...headScripts.value,
      ] as Array<RouterManagedTag>,
      hashTag,
    )
}
