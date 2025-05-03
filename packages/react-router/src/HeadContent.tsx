import * as React from 'react'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import type { RouterManagedTag } from '@tanstack/router-core'

const isTruthy = (val?: string | boolean) => val === '' || val === true
const WEIGHT_MAP = {
  meta: {
    'content-security-policy': -30,
    'charset': -20,
    'viewport': -15,
  },
  link: {
    'preconnect': 20,
    'stylesheet': 60,
    'preload': 70,
    'modulepreload': 70,
    'prefetch': 90,
    'dns-prefetch': 90,
    'prerender': 90,
  },
  script: {
    async: 30,
    defer: 80,
    sync: 50,
  },
  style: {
    imported: 40,
    sync: 60,
  },
} as const

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
      ;[...routeMeta].reverse().forEach((metas) => {
        ;[...metas].reverse().forEach((m) => {
          if (!m) return

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
  }, [routeMeta])

  const links = useRouterState({
    select: (state) =>
      state.matches
        .map((match) => match.links!)
        .filter(Boolean)
        .flat(1)
        .map((link) => ({
          tag: 'link',
          attrs: {
            ...link,
          },
        })) as Array<RouterManagedTag>,
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
  return tags.map(weightTags).sort((a, b) => a.weight - b.weight).map((tag) => (
    <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} />
  ))
}

function weightTags(tag: RouterManagedTag) {
  let weight = 100

  if (tag.tag === 'title') {
    weight = 10
  } else if (tag.tag === 'meta') {
    const metaType = tag.attrs?.httpEquiv === 'content-security-policy'
      ? 'content-security-policy'
      : tag.attrs?.charSet
        ? 'charset'
        : tag.attrs?.name === 'viewport'
          ? 'viewport'
          : null

    if (metaType) {
      weight = WEIGHT_MAP.meta[metaType]
    }
  } else if (tag.tag === 'link' && tag.attrs?.rel) {
    weight = tag.attrs.rel in WEIGHT_MAP.link ? WEIGHT_MAP.link[tag.attrs.rel as keyof typeof WEIGHT_MAP.link] : weight
  } else if (tag.tag === 'script') {
    if (isTruthy(tag.attrs?.async)) {
      weight = WEIGHT_MAP.script.async
    }
    else if (tag.attrs?.src
      && !isTruthy(tag.attrs.defer)
      && !isTruthy(tag.attrs.async)
      && tag.attrs.type !== 'module'
      && !tag.attrs.type?.endsWith('json')) {
      weight = WEIGHT_MAP.script.sync
    }
    else if (isTruthy(tag.attrs?.defer) && tag.attrs.src && !isTruthy(tag.attrs.async)) {
      weight = WEIGHT_MAP.script.defer
    }
  } else if (tag.tag === 'style') {
    weight = tag.children ? WEIGHT_MAP.style.imported : WEIGHT_MAP.style.sync
  }

  return {
    ...tag,
    weight,
  }
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
