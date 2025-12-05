import * as React from 'react'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import type { RouterManagedTag } from '@tanstack/router-core'

/**
 * Build the list of head/link/meta/script tags to render for active matches.
 * Used internally by `HeadContent`.
 */
export const useTags = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  const routeMeta = useRouterState({
    select: (state) => {
      return state.matches.map((match) => match.meta!).filter(Boolean)
    },
  })

  const meta: Array<RouterManagedTag> = React.useMemo(() => {
    const resultMeta: Array<RouterManagedTag> = []
    const metaByAttribute: Record<string, true> = {}
    let title: RouterManagedTag | undefined
    for (let i = routeMeta.length - 1; i >= 0; i--) {
      const metas = routeMeta[i]!
      for (let j = metas.length - 1; j >= 0; j--) {
        const m = metas[j]
        if (!m) continue

        if (m.title) {
          if (!title) {
            title = {
              tag: 'title',
              children: m.title,
            }
          }
        } else {
          const attribute = m.name ?? m.property
          if (attribute) {
            if (metaByAttribute[attribute]) {
              continue
            } else {
              metaByAttribute[attribute] = true
            }
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
  }, [routeMeta, nonce])

  const links = useRouterState({
    select: (state) => {
      const constructed = state.matches
        .map((match) => match.links!)
        .filter(Boolean)
        .flat(1)
        .map((link) => ({
          tag: 'link',
          attrs: {
            ...link,
            nonce,
          },
        })) satisfies Array<RouterManagedTag>

      const manifest = router.ssr?.manifest

      // These are the assets extracted from the ViteManifest
      // using the `startManifestPlugin`
      const assets = state.matches
        .map((match) => manifest?.routes[match.routeId]?.assets ?? [])
        .filter(Boolean)
        .flat(1)
        .filter((asset) => asset.tag === 'link')
        .map(
          (asset) =>
            ({
              tag: 'link',
              attrs: {
                ...asset.attrs,
                suppressHydrationWarning: true,
                nonce,
              },
            }) satisfies RouterManagedTag,
        )

      return [...constructed, ...assets]
    },
    structuralSharing: true as any,
  })

  const preloadLinks = useRouterState({
    select: (state) => {
      const preloadLinks: Array<RouterManagedTag> = []

      state.matches
        .map((match) => router.looseRoutesById[match.routeId]!)
        .forEach((route) =>
          router.ssr?.manifest?.routes[route.id]?.preloads
            ?.filter(Boolean)
            .forEach((preload) => {
              preloadLinks.push({
                tag: 'link',
                attrs: {
                  rel: 'modulepreload',
                  href: preload,
                  nonce,
                },
              })
            }),
        )

      return preloadLinks
    },
    structuralSharing: true as any,
  })

  const styles = useRouterState({
    select: (state) =>
      (
        state.matches
          .map((match) => match.styles!)
          .flat(1)
          .filter(Boolean) as Array<RouterManagedTag>
      ).map(({ children, ...attrs }) => ({
        tag: 'style',
        attrs,
        children,
        nonce,
      })),
    structuralSharing: true as any,
  })

  const headScripts: Array<RouterManagedTag> = useRouterState({
    select: (state) =>
      (
        state.matches
          .map((match) => match.headScripts!)
          .flat(1)
          .filter(Boolean) as Array<RouterManagedTag>
      ).map(({ children, ...script }) => ({
        tag: 'script',
        attrs: {
          ...script,
          nonce,
        },
        children,
      })),
    structuralSharing: true as any,
  })

  return uniqBy(
    [
      ...meta,
      ...preloadLinks,
      ...links,
      ...styles,
      ...headScripts,
    ] as Array<RouterManagedTag>,
    (d) => {
      return JSON.stringify(d)
    },
  )
}

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 * It should be rendered in the `<head>` of your document.
 */
/**
 * Render route-managed head tags (title, meta, links, styles, head scripts).
 * Place inside the document head of your app shell.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/document-head-management
 */
export function HeadContent() {
  const tags = useTags()
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  return tags.map((tag) => (
    <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} nonce={nonce} />
  ))
}

function uniqBy<T>(arr: Array<T>, fn: (item: T) => string) {
  const seen = new Set<string>()
  return arr.filter((item) => {
    const key = fn(item)
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
