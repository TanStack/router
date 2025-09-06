import * as React from 'react'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import type { RouterManagedTag } from '@tanstack/router-core'

export const useTags = () => {
  const router = useRouter()

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
            },
          })
        }
      }
    }

    if (title) {
      resultMeta.push(title)
    }

    resultMeta.reverse()

    return resultMeta
  }, [routeMeta])

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
              },
            }) satisfies RouterManagedTag,
        )

      return [...constructed, ...assets]
    },
    structuralSharing: true as any,
  })

  const preloadMeta = useRouterState({
    select: (state) => {
      const preloadMeta: Array<RouterManagedTag> = []

      state.matches
        .map((match) => router.looseRoutesById[match.routeId]!)
        .forEach((route) =>
          router.ssr?.manifest?.routes[route.id]?.preloads
            ?.filter(Boolean)
            .forEach((preload) => {
              preloadMeta.push({
                tag: 'link',
                attrs: {
                  rel: 'modulepreload',
                  href: preload,
                },
              })
            }),
        )

      return preloadMeta
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
      })),
    structuralSharing: true as any,
  })

  const headScripts = useRouterState({
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
        },
        children,
      })),
    structuralSharing: true as any,
  })

  return uniqBy(
    [
      ...meta,
      ...preloadMeta,
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
export function HeadContent() {
  const tags = useTags()
  return tags.map((tag) => (
    <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} />
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
