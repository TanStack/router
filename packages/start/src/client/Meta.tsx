import { createPortal } from 'react-dom'
import { rootRouteId, useRouter, useRouterState } from '@tanstack/react-router'
import * as React from 'react'
import { Asset } from './Asset'
import type { RootRouteOptions } from '@tanstack/react-router'
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
  const router = useRouter()
  const meta = useMeta()
  const MetaComponent = (
    router.looseRoutesById[rootRouteId]!.options as RootRouteOptions
  ).metaComponent

  const metaElements = (
    <>
      {router.isServer ? <meta name="tsr-meta" /> : null}
      {meta.map((asset, i) => (
        <Asset {...asset} key={`tsr-meta-${asset.tag}-${i}`} />
      ))}
      {router.isServer ? <meta name="/tsr-meta" /> : null}
    </>
  )

  return MetaComponent ? (
    <MetaComponent>{metaElements}</MetaComponent>
  ) : (
    metaElements
  )
}

/**
 * @description The `Meta` component is used to render meta tags and links for the current route.
 * It should be rendered in the `<head>` of your document. If you are using React 18, this will
 * likely be in your `rootRoute.shellComponent` option. If you are using React 19, this can be
 * rendered anywhere in your __root route's component.
 */
export const Meta = () => {
  return useMetaElements()
}

/**
 *
 * @deprecated DO NOT USE THIS COMPONENT.
 * This component is used internally by <StartClient /> and will be removed in a future release.
 */
export const ClientMeta = () => {
  const metaElements = useMetaElements()
  const [mounted, setMounted] = React.useState(false)

  React[
    typeof document !== 'undefined' ? 'useLayoutEffect' : 'useEffect'
  ](() => {
    // Remove all meta between the tsr meta tags
    const start = document.head.querySelector('meta[name="tsr-meta"]')
    const end = document.head.querySelector('meta[name="/tsr-meta"]')

    // Iterate over all head children and remove them until we reach the end
    let current = start?.nextElementSibling
    while (current && current !== end) {
      const next = current.nextElementSibling
      current.remove()
      current = next
    }

    // Remove the markers
    start?.remove()
    end?.remove()

    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  // Only render this on the client, using a portal
  return createPortal(metaElements, document.head)
}
