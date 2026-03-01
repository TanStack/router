import * as React from 'react'
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
      const result = []
      for (const match of state.matches) {
        const meta = match.meta
        if (!meta) continue
        result.push(meta)
      }
      return result
    },
    structuralSharing: true as any,
  })

  // Process routeMeta into separate arrays for each tag type
  const { title, ldJsonScripts, metaTags } = React.useMemo(() => {
    const ldJsonScripts: Array<RouterManagedTag> = []
    const seenLdJson = new Set<string>()
    const metaTags: Array<RouterManagedTag> = []
    const seenMeta = new Set<string>()
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
            // Deduplicate by JSON content before creating the object
            const json = JSON.stringify(m['script:ld+json'])
            if (seenLdJson.has(json)) continue
            seenLdJson.add(json)
            ldJsonScripts.push({
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
          // Deduplicate
          const key = `${m.name ?? m.property}\0${m.content}\0${m.media}`
          if (key) {
            if (seenMeta.has(key)) continue
            seenMeta.add(key)
          }

          metaTags.push({
            tag: 'meta',
            attrs: {
              ...m,
              nonce,
            },
          })
        }
      }
    }

    // Add CSP nonce meta tag if present
    if (nonce && !seenMeta.has('csp-nonce')) {
      metaTags.push({
        tag: 'meta',
        attrs: {
          property: 'csp-nonce',
          content: nonce,
        },
      })
    }

    // Reverse to restore original order (we iterated backwards for deduplication)
    ldJsonScripts.reverse()
    metaTags.reverse()

    return { title, ldJsonScripts, metaTags }
  }, [routeMeta, nonce])

  const links = useRouterState({
    select: (state) => {
      const result: Array<RouterManagedTag> = []
      const seen = new Set<string>()
      const manifest = router.ssr?.manifest

      for (const match of state.matches) {
        // Process constructed links from match.links
        const matchLinks = match.links
        if (matchLinks) {
          for (const link of matchLinks) {
            if (!link) continue
            // Deduplicate
            const key = `${link.rel}\0${link.href}\0${link.media}\0${link.type}\0${link.as}`
            if (seen.has(key)) continue
            seen.add(key)
            result.push({
              tag: 'link',
              attrs: {
                ...link,
                nonce,
              },
            })
          }
        }

        // Process assets from manifest
        const assets = manifest?.routes[match.routeId]?.assets
        if (assets) {
          for (const asset of assets) {
            if (asset.tag !== 'link') continue
            const attrs = asset.attrs
            if (!attrs) continue
            // Deduplicate
            const key = `${attrs.rel}\0${attrs.href}\0${attrs.media}\0${attrs.type}\0${attrs.as}`
            if (seen.has(key)) continue
            seen.add(key)
            result.push({
              tag: 'link',
              attrs: {
                ...attrs,
                suppressHydrationWarning: true,
                nonce,
              },
            })
          }
        }
      }

      return result
    },
    structuralSharing: true as any,
  })

  const preloadLinks = useRouterState({
    select: (state) => {
      const result: Array<RouterManagedTag> = []
      const seen = new Set<string>()
      const manifest = router.ssr?.manifest

      for (const match of state.matches) {
        const route = router.looseRoutesById[match.routeId]
        if (!route) continue

        const preloads = manifest?.routes[route.id]?.preloads
        if (!preloads) continue

        for (const preload of preloads) {
          if (!preload) continue
          // Deduplicate by href before creating the object
          if (seen.has(preload)) continue
          seen.add(preload)
          result.push({
            tag: 'link',
            attrs: {
              rel: 'modulepreload',
              href: preload,
              nonce,
            },
          })
        }
      }

      return result
    },
    structuralSharing: true as any,
  })

  const styles = useRouterState({
    select: (state) => {
      const result: Array<RouterManagedTag> = []
      const seen = new Set<string>()

      for (const match of state.matches) {
        const matchStyles = match.styles
        if (!matchStyles) continue

        for (const style of matchStyles) {
          if (!style) continue
          // Deduplicate
          const { children, ...attrs } = style
          const key = `${attrs.media}\0${children}`
          if (seen.has(key)) continue
          seen.add(key)
          result.push({
            tag: 'style',
            attrs: {
              ...attrs,
              nonce,
            },
            children: children as string | undefined,
          })
        }
      }

      return result
    },
    structuralSharing: true as any,
  })

  const headScripts = useRouterState({
    select: (state) => {
      const result: Array<RouterManagedTag> = []
      const seen = new Set<string>()

      for (const match of state.matches) {
        const matchScripts = match.headScripts
        if (!matchScripts) continue

        for (const script of matchScripts) {
          if (!script) continue
          // Deduplicate
          const { children, ...attrs } = script
          const key = `${attrs.src}\0${attrs.type}\0${children}`
          if (seen.has(key)) continue
          seen.add(key)
          result.push({
            tag: 'script',
            attrs: {
              ...attrs,
              nonce,
            },
            children: children as string | undefined,
          })
        }
      }

      return result
    },
    structuralSharing: true as any,
  })

  return [
    ...(title ? [title] : []),
    ...metaTags,
    ...ldJsonScripts,
    ...preloadLinks,
    ...links,
    ...styles,
    ...headScripts,
  ] as Array<RouterManagedTag>
}
