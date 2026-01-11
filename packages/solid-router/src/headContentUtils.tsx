import * as Solid from 'solid-js'
import { escapeHtml } from '@tanstack/router-core'
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

  const meta: Solid.Accessor<Array<RouterManagedTag>> = Solid.createMemo(() => {
    const resultMeta: Array<RouterManagedTag> = []
    const metaByAttribute: Record<string, true> = {}
    let title: RouterManagedTag | undefined
    const routeMetasArray = routeMeta()
    for (let i = routeMetasArray.length - 1; i >= 0; i--) {
      const metas = routeMetasArray[i]!
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

    if (router.options.ssr?.nonce) {
      resultMeta.push({
        tag: 'meta',
        attrs: {
          property: 'csp-nonce',
          content: router.options.ssr.nonce,
        },
      })
    }
    resultMeta.reverse()

    return resultMeta
  })

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

      const assets = state.matches
        .map((match) => manifest?.routes[match.routeId]?.assets ?? [])
        .filter(Boolean)
        .flat(1)
        .filter((asset) => asset.tag === 'link')
        .map(
          (asset) =>
            ({
              tag: 'link',
              attrs: { ...asset.attrs, nonce },
            }) satisfies RouterManagedTag,
        )

      return [...constructed, ...assets]
    },
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
  })

  const styles = useRouterState({
    select: (state) =>
      (
        state.matches
          .map((match) => match.styles!)
          .flat(1)
          .filter(Boolean) as Array<RouterManagedTag>
      ).map(({ children, ...style }) => ({
        tag: 'style',
        attrs: {
          ...style,
          nonce,
        },
        children,
      })),
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
          nonce,
        },
        children,
      })),
  })

  return () =>
    uniqBy(
      [
        ...meta(),
        ...preloadLinks(),
        ...links(),
        ...styles(),
        ...headScripts(),
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
