import {
  appendUniqueUserTags,
  deepEqual,
  escapeHtml,
  getAssetCrossOrigin,
  getScriptPreloadAttrs,
  resolveManifestCssLink,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './context'
import { splitSlot, subSlot } from './internal'
import { useStore } from './useStore'
import type {
  AnyRouteMatch,
  AnyRouter,
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

function buildTagsFromMatches(
  router: AnyRouter,
  nonce: string | undefined,
  matches: Array<AnyRouteMatch>,
  assetCrossOrigin?: AssetCrossOriginConfig,
): Array<RouterManagedTag> {
  const routeMeta = matches
    .map((match) => match.meta)
    .filter((meta) => meta !== undefined)

  const resultMeta: Array<RouterManagedTag> = []
  const metaByAttribute: Record<string, true> = {}
  let title: RouterManagedTag | undefined
  for (let i = routeMeta.length - 1; i >= 0; i--) {
    const metas = routeMeta[i]!
    for (let j = metas.length - 1; j >= 0; j--) {
      const meta = metas[j]
      if (!meta) {
        continue
      }

      if ('title' in meta && typeof meta.title === 'string') {
        title ??= { tag: 'title', children: meta.title }
      } else if ('script:ld+json' in meta) {
        try {
          resultMeta.push({
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: escapeHtml(JSON.stringify(meta['script:ld+json'])),
          })
        } catch {
          // Ignore values that cannot be serialized as JSON-LD.
        }
      } else {
        const attribute =
          ('name' in meta && typeof meta.name === 'string'
            ? meta.name
            : undefined) ??
          ('property' in meta && typeof meta.property === 'string'
            ? meta.property
            : undefined)
        if (attribute && metaByAttribute[attribute]) {
          continue
        }
        if (attribute) {
          metaByAttribute[attribute] = true
        }
        resultMeta.push({ tag: 'meta', attrs: { ...meta, nonce } })
      }
    }
  }

  if (title) {
    resultMeta.push(title)
  }
  if (nonce) {
    resultMeta.push({
      tag: 'meta',
      attrs: { property: 'csp-nonce', content: nonce },
    })
  }
  resultMeta.reverse()

  const links = matches
    .flatMap((match) => match.links ?? [])
    .filter((link) => link !== undefined)
    .map(
      (link) =>
        ({ tag: 'link', attrs: { ...link, nonce } }) satisfies RouterManagedTag,
    )

  const manifestTags: Array<RouterManagedTag> = []
  const preloadTags: Array<RouterManagedTag> = []
  const manifest = router.ssr?.manifest
  if (manifest) {
    for (const match of matches) {
      for (const link of manifest.routes[match.routeId]?.css ?? []) {
        const resolvedLink = resolveManifestCssLink(link)
        manifestTags.push({
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            ...resolvedLink,
            crossOrigin:
              getAssetCrossOrigin(assetCrossOrigin, 'stylesheet') ??
              resolvedLink.crossOrigin,
            nonce,
          },
        })
      }
      for (const preload of manifest.routes[match.routeId]?.preloads ?? []) {
        preloadTags.push({
          tag: 'link',
          attrs: {
            ...getScriptPreloadAttrs(manifest, preload, assetCrossOrigin),
            nonce,
          },
        })
      }
    }

    if (manifest.inlineStyle) {
      manifestTags.push({
        tag: 'style',
        attrs: { ...manifest.inlineStyle.attrs, nonce },
        children: manifest.inlineStyle.children,
        inlineCss: true,
      })
    }
  }

  const styles = matches
    .flatMap((match) => match.styles ?? [])
    .filter((style) => style !== undefined)
    .map(
      ({ children, ...attrs }) =>
        ({
          tag: 'style',
          attrs: { ...attrs, nonce },
          children: children,
        }) satisfies RouterManagedTag,
    )

  const headScripts = matches
    .flatMap((match) => match.headScripts ?? [])
    .filter((script) => script !== undefined)
    .map(
      ({ children, ...attrs }) =>
        ({
          tag: 'script',
          attrs: { ...attrs, nonce },
          children: children,
        }) satisfies RouterManagedTag,
    )

  const tags: Array<RouterManagedTag> = []
  appendUniqueUserTags(tags, resultMeta)
  tags.push(...preloadTags)
  appendUniqueUserTags(tags, links)
  tags.push(...manifestTags)
  appendUniqueUserTags(tags, styles)
  appendUniqueUserTags(tags, headScripts)
  return tags
}

export function useTags(...args: Array<unknown>): Array<RouterManagedTag> {
  const [userArgs, slot] = splitSlot(args)
  const assetCrossOrigin = userArgs[0] as AssetCrossOriginConfig | undefined
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

  return useStore(
    router.stores.matches,
    (matches: Array<AnyRouteMatch>) =>
      buildTagsFromMatches(router, nonce, matches, assetCrossOrigin),
    deepEqual,
    subSlot(slot, 'head:tags'),
  )
}
