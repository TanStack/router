import { Context } from '@tanstack/react-cross-context'
import {
  AnyRouter,
  RouterProvider,
  getRenderedMatches,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import * as React from 'react'

export function StartClient(props: { router: AnyRouter }) {
  if (!props.router.state.lastUpdated) {
    props.router.hydrate()
  }

  return <RouterProvider router={props.router} />
}

export function DehydrateRouter() {
  const router = useRouter()

  const dehydratedCtx = React.useContext(
    Context.get('TanStackRouterHydrationContext', {}),
  )

  const dehydrated = router.dehydratedData || dehydratedCtx

  return (
    <script
      id="__TSR_DEHYDRATED__"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `
          window.__TSR_DEHYDRATED__ = {
            data: ${JSON.stringify(
              router.options.transformer.stringify(dehydrated),
            )}
          }
        `,
      }}
    />
  )
}

declare global {
  var MANIFEST: {
    client: {
      inputs: {
        [key: string]: {
          assets: () => Promise<
            Array<{
              tag: string
              attrs: Record<string, any>
              children: string
            }>
          >
        }
      }
      handler: string
    }
  }
}

export type RouterManagedTag =
  | {
      tag: 'title'
      attrs?: Record<string, any>
      children: string
    }
  | {
      tag: 'meta' | 'link'
      attrs: Record<string, any>
      children?: never
    }
  | {
      tag: 'script'
      attrs: Record<string, any>
      children: string
    }
  | {
      tag: 'style'
      attrs: Record<string, any>
      children: string
    }

export function useMatchedMeta() {
  let routeMeta = useRouterState({
    select: (state) => {
      return getRenderedMatches(state)
        .map((match) => match.meta!)
        .filter(Boolean)
    },
  })

  let meta: RouterManagedTag[] = []
  const metaByName: Record<string, true> = {}
  let title: RouterManagedTag | undefined

    //
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

  return meta.reverse() as RouterManagedTag[]
}

export function useMatchedLinks() {
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
        })),
  })

  return links as RouterManagedTag[]
}

export function useMatchedScripts() {
  const scripts = useRouterState({
    select: (state) =>
      getRenderedMatches(state)
        .map((match) => match.scripts!)
        .filter(Boolean)
        .flat(1)
        .map((script) => ({
          tag: 'script',
          attrs: {
            ...script,
            key: `script-${script.src}`,
          },
        })),
  })

  return scripts as RouterManagedTag[]
}

export async function getManifestAssets(): Promise<RouterManagedTag[]> {
  const manifest = globalThis.MANIFEST?.['client']

  if (manifest) {
    return (
      ((await manifest.inputs[
        manifest.handler!
      ]?.assets()) as RouterManagedTag[]) || []
    )
  }

  return []
}

export const Meta = React.lazy(async () => {
  const manifestMeta = (await getManifestAssets()).filter(
    (d) => d.tag !== 'script',
  ) as RouterManagedTag[]

  return {
    default: function Meta() {
      const meta = useMatchedMeta()
      const links = useMatchedLinks()

      console.log(meta)

      return (
        <>
          {[...meta, ...links, ...manifestMeta].map((asset, i) => (
            <Asset {...asset} key={i} />
          ))}
        </>
      )
    },
  }
})

export const Scripts = React.lazy(async () => {
  const manifestScripts = (await getManifestAssets()).filter(
    (d) => d.tag === 'script',
  ) as RouterManagedTag[]

  return {
    default: function Scripts() {
      const scripts = useMatchedScripts()

      return (
        <>
          <DehydrateRouter />
          {[...scripts, ...manifestScripts].map((asset, i) => (
            <Asset {...asset} key={i} />
          ))}
        </>
      )
    },
  }
})

export function Asset({ tag, attrs, children }: RouterManagedTag): any {
  switch (tag) {
    case 'title':
      return <title {...attrs}>{children}</title>
    case 'meta':
      return <meta {...attrs} />
    case 'link':
      return <link {...attrs} />
    case 'style':
      return <style {...attrs} dangerouslySetInnerHTML={{ __html: children }} />
    case 'script':
      if (attrs.src) {
        return <script {...attrs} />
      }
      return (
        <script
          {...attrs}
          dangerouslySetInnerHTML={{
            __html: children,
          }}
        />
      )
  }
}
