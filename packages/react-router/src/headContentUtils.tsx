import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import {
  _getAssetMatches,
  appendUniqueUserTags,
  deepEqual,
  escapeHtml,
  getAssetCrossOrigin,
  getScriptPreloadAttrs,
  resolveManifestCssLink,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type {
  AnyRouteMatch,
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

function buildTagsFromMatches(
  router: ReturnType<typeof useRouter>,
  nonce: string | undefined,
  matches: Array<AnyRouteMatch>,
  assetCrossOrigin?: AssetCrossOriginConfig,
): Array<RouterManagedTag> {
  matches = _getAssetMatches(matches)
  const resultMeta: Array<RouterManagedTag> = []
  const metaByAttribute: Record<string, true> = {}
  let title: RouterManagedTag | undefined
  for (let i = matches.length - 1; i >= 0; i--) {
    const metas = matches[i]!.meta
    if (!metas) {
      continue
    }
    for (let j = metas.length - 1; j >= 0; j--) {
      const m = metas[j]
      if (!m) {
        continue
      }

      if (m.title) {
        title ??= {
          tag: 'title',
          children: m.title,
        }
      } else if ('script:ld+json' in m) {
        try {
          const json = JSON.stringify(m['script:ld+json'])
          resultMeta.push({
            tag: 'script',
            attrs: {
              type: 'application/ld+json',
            },
            children: escapeHtml(json),
          })
        } catch {
          // Skip invalid JSON-LD objects
        }
      } else {
        const attribute = m.name ?? m.property
        if (attribute) {
          if (metaByAttribute[attribute]) {
            continue
          }
          metaByAttribute[attribute] = true
        }

        resultMeta.push({
          tag: 'meta',
          attrs: {
            ...m,
            nonce,
          },
        })
      }
    }
  }

  if (title) {
    resultMeta.push(title)
  }

  if (nonce) {
    resultMeta.push({
      tag: 'meta',
      attrs: {
        property: 'csp-nonce',
        content: nonce,
      },
    })
  }
  resultMeta.reverse()

  const manifest = router.ssr?.manifest
  const constructedLinks: Array<RouterManagedTag> = []
  const manifestCssTags: Array<RouterManagedTag> = []
  const preloadLinks: Array<RouterManagedTag> = []
  const styles: Array<RouterManagedTag> = []
  const headScripts: Array<RouterManagedTag> = []
  for (const match of matches) {
    for (const link of match.links ?? []) {
      if (link) {
        constructedLinks.push({
          tag: 'link',
          attrs: { ...link, nonce },
        })
      }
    }
    const manifestRoute = manifest?.routes[match.routeId]
    if (manifestRoute) {
      for (const link of manifestRoute.css ?? []) {
        const resolvedLink = resolveManifestCssLink(link)
        manifestCssTags.push({
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            ...resolvedLink,
            crossOrigin:
              getAssetCrossOrigin(assetCrossOrigin, 'stylesheet') ??
              resolvedLink.crossOrigin,
            suppressHydrationWarning: true,
            nonce,
          },
        })
      }
      for (const preload of manifestRoute.preloads ?? []) {
        preloadLinks.push({
          tag: 'link',
          attrs: {
            ...getScriptPreloadAttrs(manifest, preload, assetCrossOrigin),
            nonce,
          },
        })
      }
    }
    for (const style of match.styles ?? []) {
      if (style) {
        const { children, ...attrs } = style
        styles.push({
          tag: 'style',
          attrs: { ...attrs, nonce },
          children: children as string | undefined,
        })
      }
    }
    for (const script of match.headScripts ?? []) {
      if (script) {
        const { children, ...attrs } = script
        headScripts.push({
          tag: 'script',
          attrs: { ...attrs, nonce },
          children: children as string | undefined,
        })
      }
    }
  }

  if (manifest?.inlineStyle) {
    manifestCssTags.push({
      tag: 'style',
      attrs: {
        ...manifest.inlineStyle.attrs,
        nonce,
      },
      children: manifest.inlineStyle.children,
      inlineCss: true,
    })
  }

  const tags: Array<RouterManagedTag> = []
  appendUniqueUserTags(tags, resultMeta)
  tags.push(...preloadLinks)
  appendUniqueUserTags(tags, constructedLinks)
  tags.push(...manifestCssTags)
  appendUniqueUserTags(tags, styles)
  appendUniqueUserTags(tags, headScripts)
  return tags
}

/**
 * Build the head/link/meta/script tags from the renderable presented prefix.
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
  const selectTags = React.useCallback(
    (matches: Array<AnyRouteMatch>) =>
      buildTagsFromMatches(router, nonce, matches, assetCrossOrigin),
    [assetCrossOrigin, nonce, router],
  )
  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  return useStore(router.stores.matches, selectTags, deepEqual)
}
