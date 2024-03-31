import {
  getRenderedMatches,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import * as React from 'react'
import { Asset } from './Asset'
import type { RouterManagedTag } from './RouterManagedTag'

function getMetaKey(asset: RouterManagedTag, index: number) {
  if (asset.tag === 'title') {
    return `tsr-meta-title`
  }

  if (asset.tag === 'meta') {
    const ident = [
      asset.attrs.name,
      asset.attrs.content,
      asset.attrs.httpEquiv,
      asset.attrs.charSet,
    ].join('')
    return `tsr-meta-meta-${ident}`
  }

  if (asset.tag === 'link') {
    const ident = [asset.attrs.rel, asset.attrs.href].join('')
    return `tsr-meta-link-${ident}`
  }

  return `tsr-meta-${asset.tag}-${index}`
}

export const Meta = () => {
  const router = useRouter()

  const routeMeta = useRouterState({
    select: (state) => {
      return getRenderedMatches(state)
        .map((match) => match.meta!)
        .filter(Boolean)
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
      getRenderedMatches(state)
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

  const manifestMeta = router.options.context?.assets.filter(
    (d: any) => d.tag !== 'script',
  ) as Array<RouterManagedTag>

  return (
    <>
      {[...meta, ...links, ...manifestMeta].map((asset, i) => (
        <Asset {...asset} key={getMetaKey(asset, i)} />
      ))}
    </>
  )
}
