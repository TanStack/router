import * as Solid from 'solid-js'
import {
  _getAssetMatches,
  appendUniqueUserTags,
  escapeHtml,
  getAssetCrossOrigin,
  getScriptPreloadAttrs,
  resolveManifestCssLink,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type { HeadTag } from '@solidjs/web'
import type {
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

/**
 * Build the head/link/meta/script tags from the renderable presented prefix.
 * Used internally by `HeadContent`.
 */
export const useTags = (assetCrossOrigin?: AssetCrossOriginConfig) => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  const activeMatches = Solid.createMemo(() =>
    _getAssetMatches(router.stores.matches.get()),
  )
  const routeMeta = Solid.createMemo(() =>
    activeMatches()
      .map((match) => match.meta)
      .filter((meta) => meta !== undefined),
  )

  const meta: Solid.Accessor<Array<RouterManagedTag>> = Solid.createMemo(() => {
    const resultMeta: Array<RouterManagedTag> = []
    const metaByAttribute: Record<string, true> = {}
    let title: RouterManagedTag | undefined
    const routeMetasArray = routeMeta()
    for (let i = routeMetasArray.length - 1; i >= 0; i--) {
      const metas = routeMetasArray[i]!
      for (let j = metas.length - 1; j >= 0; j--) {
        const m = metas[j]
        if (!m) {
          continue
        }

        if (m.title) {
          if (!title) {
            title = {
              tag: 'title',
              children: m.title,
            }
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
            // Skip invalid JSON-LD objects.
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
    return resultMeta
  })

  const links = Solid.createMemo(() => {
    return activeMatches()
      .flatMap((match) => match.links ?? [])
      .filter((link) => link !== undefined)
      .map((link) => ({
        tag: 'link',
        attrs: {
          ...link,
          nonce,
        },
      })) satisfies Array<RouterManagedTag>
  })

  const retainedManifestCssTags = new Map<string, RouterManagedTag>()
  const manifestCssTags = Solid.createMemo(() => {
    const manifest = router.ssr?.manifest
    const tags: Array<RouterManagedTag> = []

    if (!manifest) {
      return tags
    }

    for (const match of activeMatches()) {
      for (const link of manifest.routes[match.routeId]?.css ?? []) {
        const resolvedLink = resolveManifestCssLink(link)
        const tag: RouterManagedTag = {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            ...resolvedLink,
            crossOrigin:
              getAssetCrossOrigin(assetCrossOrigin, 'stylesheet') ??
              resolvedLink.crossOrigin,
            nonce,
          },
        }
        const key = JSON.stringify(tag)
        if (!retainedManifestCssTags.has(key)) {
          retainedManifestCssTags.set(key, tag)
        }
      }
    }

    // Lazy modules are cached and do not reinsert their CSS when revisited.
    tags.push(...retainedManifestCssTags.values())

    if (manifest.inlineStyle) {
      tags.push({
        tag: 'style',
        attrs: {
          ...manifest.inlineStyle.attrs,
          nonce,
        },
        children: manifest.inlineStyle.children,
        inlineCss: true,
      })
    }

    return tags
  })

  const preloadLinks = Solid.createMemo(() => {
    const manifest = router.ssr?.manifest
    const tags: Array<RouterManagedTag> = []
    for (const match of activeMatches()) {
      for (const preload of manifest?.routes[match.routeId]?.preloads ?? []) {
        if (!preload) {
          continue
        }
        tags.push({
          tag: 'link',
          attrs: {
            ...getScriptPreloadAttrs(manifest, preload, assetCrossOrigin),
            nonce,
          },
        })
      }
    }
    return tags
  })

  const styles = Solid.createMemo(() => {
    return activeMatches()
      .flatMap((match) => match.styles ?? [])
      .filter((style) => style !== undefined)
      .map(({ children, ...attrs }) => ({
        tag: 'style',
        attrs: {
          ...attrs,
          nonce,
        },
        children: children as string | undefined,
      })) satisfies Array<RouterManagedTag>
  })

  const headScripts = Solid.createMemo(() => {
    return activeMatches()
      .flatMap((match) => match.headScripts ?? [])
      .filter((script) => script !== undefined)
      .map(({ children, ...attrs }) => ({
        tag: 'script',
        attrs: {
          ...attrs,
          nonce,
        },
        children: children as string | undefined,
      })) satisfies Array<RouterManagedTag>
  })

  return Solid.createMemo(() => {
    const next: Array<RouterManagedTag> = []
    appendUniqueUserTags(next, meta())
    appendUniqueUserTags(next, links())
    next.push(...manifestCssTags())
    next.push(...preloadLinks())
    appendUniqueUserTags(next, styles())
    appendUniqueUserTags(next, headScripts())
    return next
  })
}

const INLINE_CSS_HYDRATION_ATTR = 'data-tsr-inline-css'

/**
 * Convert the router-managed tags into head registry descriptors for
 * `useHead`. Pure data mapping — it is evaluated inside the registry's own
 * flush boundary (server) / effect (client), so it must not allocate
 * reactive owners.
 */
export function toHeadTags(tags: Array<RouterManagedTag>): Array<HeadTag> {
  return tags.map(toHeadTag)
}

function toHeadTag(t: RouterManagedTag): HeadTag {
  const props: Record<string, any> = { ...t.attrs }
  let children: string | undefined = t.children

  if (
    t.tag === 'style' &&
    t.inlineCss &&
    (process.env.TSS_INLINE_CSS_ENABLED === 'true' ||
      (process.env.TSS_INLINE_CSS_ENABLED === undefined && isServer))
  ) {
    // Mark the inline-CSS style so the client can find it again: the
    // serialized manifest omits the CSS text, so on the client the tag
    // arrives with `children === undefined` and the text is recovered from
    // the server-rendered element.
    props[INLINE_CSS_HYDRATION_ATTR] = ''
  }

  if (
    t.tag === 'style' &&
    t.inlineCss &&
    children === undefined &&
    typeof document !== 'undefined'
  ) {
    children =
      document.querySelector<HTMLStyleElement>(
        `style[${INLINE_CSS_HYDRATION_ATTR}]`,
      )?.textContent ?? ''
  }

  if (children !== undefined) {
    props.children = children
  }

  const headTag: HeadTag = { tag: t.tag, props }

  // Inline scripts and styles have no natural registry identity: the
  // registry assigns them per-runtime unique ids, which can never match
  // between server and client, so hydration would append a client copy
  // next to the server-rendered one. A stable content-derived key gives
  // both runtimes the same identity to reconcile on.
  if (t.tag === 'style' || (t.tag === 'script' && props.src === undefined)) {
    headTag.key = `tsr-${hashString(t.tag + JSON.stringify(props))}`
  }

  return headTag
}

function hashString(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}
