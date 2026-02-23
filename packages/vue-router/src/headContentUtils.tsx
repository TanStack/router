import * as Vue from 'vue'
import { useStore } from '@tanstack/vue-store'

import { escapeHtml } from '@tanstack/router-core'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

export const useTags = () => {
  const router = useRouter()
  const matches = useStore(
    router.stores.activeMatchesSnapshot,
    (value) => value,
  )

  const meta = Vue.computed<Array<RouterManagedTag>>(() => {
    const resultMeta: Array<RouterManagedTag> = []
    const metaByAttribute: Record<string, true> = {}
    let title: RouterManagedTag | undefined
    ;[...matches.value.map((match) => match.meta!).filter(Boolean)]
      .reverse()
      .forEach((metas) => {
        ;[...metas].reverse().forEach((m) => {
          if (!m) return

          if (m.title) {
            if (!title) {
              title = {
                tag: 'title',
                children: m.title,
              }
            }
          } else if ('script:ld+json' in m) {
            // Handle JSON-LD structured data
            // Content is HTML-escaped to prevent XSS when injected via innerHTML
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
                return
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
        })
      })

    if (title) {
      resultMeta.push(title)
    }

    resultMeta.reverse()

    return resultMeta
  })

  const links = Vue.computed<Array<RouterManagedTag>>(
    () =>
      matches.value
        .map((match) => match.links!)
        .filter(Boolean)
        .flat(1)
        .map((link) => ({
          tag: 'link',
          attrs: {
            ...link,
          },
        })) as Array<RouterManagedTag>,
  )

  const preloadMeta = Vue.computed<Array<RouterManagedTag>>(() => {
    const preloadMeta: Array<RouterManagedTag> = []

    matches.value
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
  })

  const headScripts = Vue.computed<Array<RouterManagedTag>>(() =>
    (
      matches.value
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
  )

  const manifestAssets = Vue.computed<Array<RouterManagedTag>>(() => {
    const manifest = router.ssr?.manifest

    const assets = matches.value
      .map((match) => manifest?.routes[match.routeId]?.assets ?? [])
      .filter(Boolean)
      .flat(1)
      .filter((asset) => asset.tag === 'link')
      .map(
        (asset) =>
          ({
            tag: 'link',
            attrs: { ...asset.attrs },
          }) satisfies RouterManagedTag,
      )

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
      (d) => {
        return JSON.stringify(d)
      },
    )
}

export function uniqBy<T>(arr: Array<T>, fn: (item: T) => string) {
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
