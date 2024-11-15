import { ScriptOnce, useRouter, useRouterState } from '@tanstack/react-router'
import * as React from 'react'
import jsesc from 'jsesc'
import { Context } from '@tanstack/react-cross-context'
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
    structuralSharing: true as any,
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
    structuralSharing: true as any,
  })

  return uniqBy(
    [...meta, ...preloadMeta, ...links] as Array<RouterManagedTag>,
    (d) => {
      return JSON.stringify(d)
    },
  )
}

export const useMetaElements = () => {
  const router = useRouter()
  const meta = useMeta()

  const dehydratedCtx = React.useContext(
    Context.get('TanStackRouterHydrationContext', {}),
  )

  return (
    <>
      {meta.map((asset, i) => (
        <Asset {...asset} key={`tsr-meta-${JSON.stringify(asset)}`} />
      ))}
      <>
        <ScriptOnce
          log={false}
          children={`
__TSR__ = {
  matches: [],
  streamedValues: {},
  initMatch: (match) => {
    if (!__TSR__.matches[match.index]) {
      __TSR__.matches[match.index] = match
      Object.entries(match.extracted).forEach(([id, ex]) => {
        if (ex.type === 'stream') {
          let controller;
          ex.value = new ReadableStream({
            start(c) { controller = c; }
          })
          ex.value.controller = controller
        } else if (ex.type === 'promise') {
          let r, j
          ex.value = new Promise((r_, j_) => { r = r_, j = j_ })
          ex.resolve = r; ex.reject = j
        }
      })
    }
  },
  cleanScripts: () => {
    document.querySelectorAll('.tsr-once').forEach((el) => {
      el.remove()
    })
  },
}`}
        />
        <ScriptOnce
          children={`__TSR__.dehydrated = ${jsesc(
            router.options.transformer.stringify(dehydratedCtx),
            {
              isScriptContext: true,
              wrap: true,
              json: true,
            },
          )}`}
        />
      </>
    </>
  )
}

/**
 * @description The `Meta` component is used to render meta tags and links for the current route.
 * It should be rendered in the `<head>` of your document.
 */
export const Meta = () => {
  return <>{useMetaElements()}</>
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
