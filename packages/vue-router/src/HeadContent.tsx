import * as Vue from 'vue'

import { buildDevStylesUrl, escapeHtml } from '@tanstack/router-core'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import type { RouterManagedTag } from '@tanstack/router-core'

/**
 * Renders a stylesheet link for dev mode CSS collection.
 * On the server, renders the full link with route-scoped CSS URL.
 * On the client, renders the same link to avoid hydration mismatch,
 * then removes it after hydration since Vite's HMR handles CSS updates.
 */
const DevStylesLink = Vue.defineComponent({
  name: 'DevStylesLink',
  setup() {
    const router = useRouter()
    const routeIds = useRouterState({
      select: (state) => state.matches.map((match) => match.routeId),
    })

    Vue.onMounted(() => {
      // After hydration, remove the SSR-rendered dev styles link
      document
        .querySelectorAll('[data-tanstack-start-dev-styles]')
        .forEach((el) => el.remove())
    })

    const href = Vue.computed(() =>
      buildDevStylesUrl(router.basepath, routeIds.value),
    )

    return () =>
      Vue.h('link', {
        rel: 'stylesheet',
        href: href.value,
        'data-tanstack-start-dev-styles': true,
      })
  },
})

export const useTags = () => {
  const router = useRouter()

  const routeMeta = useRouterState({
    select: (state) => {
      return state.matches.map((match) => match.meta!).filter(Boolean)
    },
  })

  const meta: Vue.Ref<Array<RouterManagedTag>> = Vue.computed(() => {
    const resultMeta: Array<RouterManagedTag> = []
    const metaByAttribute: Record<string, true> = {}
    let title: RouterManagedTag | undefined
    ;[...routeMeta.value].reverse().forEach((metas) => {
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

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 * It should be rendered in the `<head>` of your document.
 */
export const HeadContent = Vue.defineComponent({
  name: 'HeadContent',
  setup() {
    const tags = useTags()

    return () => {
      const children = tags().map((tag) =>
        Vue.h(Asset, {
          ...tag,
          key: `tsr-meta-${JSON.stringify(tag)}`,
        }),
      )

      // In dev mode, prepend the DevStylesLink
      if (process.env.NODE_ENV !== 'production') {
        return [Vue.h(DevStylesLink), ...children]
      }

      return children
    }
  },
})

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
