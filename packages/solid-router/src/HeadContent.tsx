import { For } from 'solid-js'
import { HydrationScript } from '@solidjs/web'
import { Asset } from './Asset'
import { useTags } from './headContentUtils'
import type { AssetCrossOriginConfig } from '@tanstack/router-core'

export interface HeadContentProps {
  assetCrossOrigin?: AssetCrossOriginConfig
}

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 * Place this component inside the `<head>` of your document so the rendered tags end up in the right place.
 */
export function HeadContent(props: HeadContentProps) {
  const tags = useTags(props.assetCrossOrigin)

  return (
    <>
      <HydrationScript />
      <For each={tags()}>
        {(tag) => {
          const t = tag as any
          return <Asset tag={t.tag} attrs={t.attrs} children={t.children} />
        }}
      </For>
    </>
  )
}
