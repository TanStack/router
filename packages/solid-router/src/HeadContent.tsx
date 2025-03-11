import * as Solid from 'solid-js'
import { MetaProvider } from '@solidjs/meta'
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

  const meta: Solid.Accessor<Array<RouterManagedTag>> = Solid.createMemo(() => {
    const resultMeta: Array<RouterManagedTag> = []
    const metaByAttribute: Record<string, true> = {}
    let title: RouterManagedTag | undefined
    ;[...routeMeta()].reverse().forEach((metas) => {
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
  })

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
  })

  return () =>
    uniqBy(
      [
        ...meta(),
        ...preloadMeta(),
        ...links(),
        ...headScripts(),
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
  return (
    <MetaProvider>
      {tags().map((tag) => (
        <Asset {...tag} />
      ))}
    </MetaProvider>
  )
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
