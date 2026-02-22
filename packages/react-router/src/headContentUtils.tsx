import * as React from 'react'
import { useStore } from './store'
import { escapeHtml } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

function buildTagsFromMatches(
  router: ReturnType<typeof useRouter>,
  nonce: string | undefined,
  matches: Array<any>,
): Array<RouterManagedTag> {
  const routeMeta = matches.map((match) => match.meta!).filter(Boolean)

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

  const constructedLinks = matches
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
  const assetLinks = matches
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

  const preloadLinks: Array<RouterManagedTag> = []
  matches
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

  const styles = (
    matches
      .map((match) => match.styles!)
      .flat(1)
      .filter(Boolean) as Array<RouterManagedTag>
  ).map(({ children, ...attrs }) => ({
    tag: 'style',
    attrs: {
      ...attrs,
      nonce,
    },
    children,
  }))

  const headScripts = (
    matches
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
    (d) => JSON.stringify(d),
  )
}

/**
 * Build the list of head/link/meta/script tags to render for active matches.
 * Used internally by `HeadContent`.
 */
export const useTags = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  if (isServer ?? router.isServer) {
    return buildTagsFromMatches(
      router,
      nonce,
      router.stores.activeMatchesSnapshot.state,
    )
  }

  const routeMeta = useStore(router.stores.activeMatchesSnapshot, (matches) => {
    return matches.map((match) => match.meta!).filter(Boolean)
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
        } else if ('script:ld+json' in m) {
          // Handle JSON-LD structured data
          // Content is HTML-escaped to prevent XSS when injected via dangerouslySetInnerHTML
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

  const links = useStore(router.stores.activeMatchesSnapshot, (matches) => {
    const constructed = matches
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
    const assets = matches
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
  })

  const preloadLinks = useStore(
    router.stores.activeMatchesSnapshot,
    (matches) => {
      const preloadLinks: Array<RouterManagedTag> = []

      matches
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
  )

  const styles = useStore(router.stores.activeMatchesSnapshot, (matches) =>
    (
      matches
        .map((match) => match.styles!)
        .flat(1)
        .filter(Boolean) as Array<RouterManagedTag>
    ).map(({ children, ...attrs }) => ({
      tag: 'style',
      attrs: {
        ...attrs,
        nonce,
      },
      children,
    })),
  )

  const headScripts: Array<RouterManagedTag> = useStore(
    router.stores.activeMatchesSnapshot,
    (matches) =>
      (
        matches
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
  )

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
