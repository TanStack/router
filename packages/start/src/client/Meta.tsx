import { useRouter, useRouterState } from '@tanstack/react-router'
import * as React from 'react'
import { Asset } from './Asset'
import type { RouterManagedTag } from './RouterManagedTag'

export const useMeta = () => {
  const router = useRouter()

  const routeMeta = useRouterState({
    select: (state) => {
      return state.matches.map((match) => match.meta!).filter(Boolean)
    },
  })

  const meta: Array<RouterManagedTag> = React.useMemo(() => {
    const resultMeta: Array<RouterManagedTag> = []
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
  })

  const manifestMeta =
    (
      router.options.context?.assets?.filter((d: any) => d.tag !== 'script') as
        | Array<RouterManagedTag>
        | undefined
    )?.map(({ tag, children, attrs }) => {
      const { key, ...rest } = attrs || {}
      return {
        tag,
        attrs: rest,
        children,
      }
    }) ?? []

  return [...meta, ...links, ...manifestMeta] as Array<RouterManagedTag>
}

export const useMetaElements = () => {
  const meta = useMeta()

  return (
    <>
      {meta.map((asset, i) => (
        <Asset {...asset} key={`tsr-meta-${asset.tag}-${i}`} />
      ))}
    </>
  )
}

/**
 * @description The `Meta` component is used to render meta tags and links for the current route.
 * It should be rendered in the `<head>` of your document.
 */
export const Meta = () => {
  return useMetaElements()
}
