/* eslint-disable no-shadow */
import { ScriptOnce, useRouter, useRouterState } from '@tanstack/react-router'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Asset } from './Asset'
import type { RouterManagedTag } from '@tanstack/react-router'

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

  const preloadMeta = useRouterState({
    select: (state) => {
      const preloadMeta: Array<RouterManagedTag> = []

      state.matches
        .map((match) => router.looseRoutesById[match.routeId]!)
        .forEach((route) =>
          router.manifest?.routes[route.id]?.preloads
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

  return uniqBy(
    [...meta, ...preloadMeta, ...links] as Array<RouterManagedTag>,
    (d) => {
      return JSON.stringify(d)
    },
  )
}

export const useMetaElements = () => {
  const meta = useMeta()

  return (
    <>
      <meta name="tsr-meta" />
      {meta.map((asset, i) => (
        <Asset {...asset} key={`tsr-meta-${JSON.stringify(asset)}`} />
      ))}
      <meta name="/tsr-meta" />
    </>
  )
}

/**
 * @description The `Meta` component is used to render meta tags and links for the current route.
 * It should be rendered in the `<head>` of your document.
 */
export const Meta = ({ children }: { children?: React.ReactNode }) => {
  const router = useRouter()
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

  const all = (
    <>
      {metaElements}
      {children}
    </>
  )

  if (router.isServer) {
    return all
  }

  if (!mounted) {
    return null
  }

  return createPortal(all, document.head)
}

export function Html({ children, ...props }: React.HTMLProps<HTMLHtmlElement>) {
  const router = useRouter()

  // warning(
  //   !Object.keys(props).length,
  //   'Passing props other than children to the Html component will be supported very soon in React 19.',
  // )

  if (!router.isServer) {
    return <>{children}</>
  }

  return <html>{children}</html>
}

export function Head({ children, ...props }: React.HTMLProps<HTMLHeadElement>) {
  const router = useRouter()

  // warning(
  //   !Object.keys(props).length,
  //   'Passing props other than children to the Head component will be supported very soon in React 19.',
  // )

  if (!router.isServer) {
    return children
  }

  return <head>{children}</head>
}

export function Body({ children, ...props }: React.HTMLProps<HTMLBodyElement>) {
  const router = useRouter()

  // warning(
  //   !Object.keys(props).length,
  //   'Passing props other than children to the Body component will be supported very soon in React 19.',
  // )

  if (!router.isServer) {
    return children
  }

  return (
    <body>
      <div id="root">{children}</div>
    </body>
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
