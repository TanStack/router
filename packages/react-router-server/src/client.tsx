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
          window.__TSR_DEHYDRATED__ = ${JSON.stringify(dehydrated)}
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
  let meta = useRouterState({
    select: (state) =>
      getRenderedMatches(state)
        .map((match) => match.meta!)
        .filter(Boolean)
        .flat(1)
        .map(({ title, ...meta }) => ({
          tag: title ? 'title' : 'meta',
          attrs: {
            ...meta,
            key: `meta-${title}-${meta.content}`,
          },
          children: title,
        })),
  })

  // Only use the last title
  const reversed = [...meta].reverse()
  const lastTitle = reversed.findIndex((m) => m.tag === 'title')
  meta = reversed
    .filter((m, i) => i === lastTitle || m.tag !== 'title')
    .reverse()

  return meta as RouterManagedTag[]
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
            key: `link-rel=${link.rel}-href=${link.href}`,
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
            key: `script-href=${script.src}`,
          },
        })),
  })

  return scripts as RouterManagedTag[]
}

export const Assets = React.lazy(async () => {
  const manifest = globalThis.MANIFEST?.['client']
  let manifestAssets: RouterManagedTag[] = []

  if (manifest) {
    manifestAssets = (await manifest.inputs[
      manifest.handler!
    ]?.assets()) as RouterManagedTag[]
  }

  return {
    default: function Assets() {
      const meta = useMatchedMeta()
      const links = useMatchedLinks()
      const scripts = useMatchedScripts()

      return (
        <>
          {[...meta, ...links, ...scripts, ...(manifestAssets || [])].map(
            (asset, i) => renderAsset(asset as any, i),
          )}
        </>
      )
    },
  }
})

export function renderAsset(
  { tag, attrs, children }: RouterManagedTag,
  index: number,
): any {
  switch (tag) {
    case 'title':
      return <title {...attrs}>{children}</title>
    case 'meta':
      return <meta {...attrs} key={attrs.key || `meta-${index}`} />
    case 'link':
      return <link {...attrs} key={attrs.key || `link-${index}`} />
    case 'style':
      return (
        <style
          {...attrs}
          key={attrs.key || `style-${index}`}
          dangerouslySetInnerHTML={{ __html: children }}
        />
      )
    case 'script':
      if (attrs.src) {
        return <script {...attrs} key={attrs.src} />
      } else {
        return (
          <script
            {...attrs}
            key={attrs.key || `script-${index}`}
            dangerouslySetInnerHTML={{
              __html: children,
            }}
          />
        )
      }
  }
}
