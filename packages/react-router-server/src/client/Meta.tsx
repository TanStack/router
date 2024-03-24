import {
  getRenderedMatches,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import * as React from 'react'
import { RouterManagedTag } from './RouterManagedTag'
import { Asset } from './Asset'

export const Meta = () => {
  const router = useRouter()

  let routeMeta = useRouterState({
    select: (state) => {
      return getRenderedMatches(state)
        .map((match) => match.meta!)
        .filter(Boolean)
    },
  })

  const meta: RouterManagedTag[] = React.useMemo(() => {
    let meta: RouterManagedTag[] = []
    const metaByName: Record<string, true> = {}
    let title: RouterManagedTag | undefined
    ;[...routeMeta].reverse().forEach((metas) => {
      ;[...metas].reverse().forEach((m) => {
        if (m.title) {
          if (!title) {
            title = {
              tag: 'title',
              children: m.title,
            }
          }
        } else {
          if (m.name) {
            if (metaByName[m.name]) {
              return
            } else {
              metaByName[m.name] = true
            }
          }

          meta.push({
            tag: 'meta',
            attrs: {
              ...m,
              key: `meta-${[m.name, m.content, m.httpEquiv, m.charSet].join('')}`,
            },
          })
        }
      })
    })

    if (title) {
      meta.push(title)
    }

    meta.reverse()

    return meta as RouterManagedTag[]
  }, [routeMeta])

  const links = useRouterState({
    select: (state) =>
      getRenderedMatches(state)
        .map((match) => match.links!)
        .filter(Boolean)
        .flat(1)
        .map((link) => ({
          tag: 'link',
          attrs: {
            ...link,
            key: `link-${[link.rel, link.href].join('')}`,
          },
        })) as RouterManagedTag[],
  })

  const manifestMeta = router.options.context?.assets.filter(
    (d: any) => d.tag !== 'script',
  ) as RouterManagedTag[]

  return (
    <>
      {[...meta, ...links, ...manifestMeta].map((asset, i) => (
        <Asset {...asset} key={i} />
      ))}
    </>
  )
}
