import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import {
  buildMetaTags,
  dedupByLastKey,
  deepEqual,
  getAssetCrossOrigin,
  hashTag,
  isInlinableStylesheet,
  resolveManifestAssetLink,
  uniqBy,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type {
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

function buildTagsFromMatches(
  router: ReturnType<typeof useRouter>,
  nonce: string | undefined,
  matches: Array<any>,
  assetCrossOrigin?: AssetCrossOriginConfig,
): Array<RouterManagedTag> {
  const resultMeta = buildMetaTags(
    matches.map((match) => match.meta!).filter(Boolean),
    nonce,
  )

  const constructedLinks = dedupByLastKey(
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
  const assetLinks = matches
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
              suppressHydrationWarning: true,
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

  const styles = dedupByLastKey(
    matches
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
  }))

  const headScripts = dedupByLastKey(
    matches
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
  }))

  return uniqBy(
    [
      ...resultMeta,
      ...preloadLinks,
      ...constructedLinks,
      ...assetLinks,
      ...styles,
      ...headScripts,
    ] as Array<RouterManagedTag>,
    hashTag,
  )
}

/**
 * Build the list of head/link/meta/script tags to render for active matches.
 * Used internally by `HeadContent`.
 */
export const useTags = (assetCrossOrigin?: AssetCrossOriginConfig) => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  if (isServer ?? router.isServer) {
    return buildTagsFromMatches(
      router,
      nonce,
      router.stores.matches.get(),
      assetCrossOrigin,
    )
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const routeMeta = useStore(
    router.stores.matches,
    (matches) => {
      return matches.map((match) => match.meta!).filter(Boolean)
    },
    deepEqual,
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const meta: Array<RouterManagedTag> = React.useMemo(
    () => buildMetaTags(routeMeta, nonce),
    [routeMeta, nonce],
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const links = useStore(
    router.stores.matches,
    (matches) => {
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

      // These are the assets extracted from the ViteManifest
      // using the `startManifestPlugin`
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
                  suppressHydrationWarning: true,
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
    },
    deepEqual,
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const preloadLinks = useStore(
    router.stores.matches,
    (matches) => {
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
    },
    deepEqual,
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const styles = useStore(
    router.stores.matches,
    (matches) =>
      dedupByLastKey(
        matches
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
    deepEqual,
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const headScripts: Array<RouterManagedTag> = useStore(
    router.stores.matches,
    (matches) =>
      dedupByLastKey(
        matches
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
    deepEqual,
  )

  return uniqBy(
    [
      ...meta,
      ...preloadLinks,
      ...links,
      ...styles,
      ...headScripts,
    ] as Array<RouterManagedTag>,
    hashTag,
  )
}
