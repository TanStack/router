import { For, createEffect, createMemo } from 'solid-js'
import { HydrationScript } from '@solidjs/web'
import { DEV_STYLES_ATTR } from '@tanstack/router-core'
import { Asset } from './Asset'
import { useHydrated } from './ClientOnly'
import { useTags } from './headContentUtils'
import type { HeadContentProps } from './HeadContent'

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 *
 * Development version: filters out dev styles link after hydration and
 * includes a fallback cleanup effect for hydration mismatch cases.
 */
export function HeadContent(props: HeadContentProps) {
  const tags = useTags(props.assetCrossOrigin)
  const hydrated = useHydrated()

  // Fallback cleanup for hydration mismatch cases
  // Runs when hydration completes to remove any orphaned dev styles links from DOM
  createEffect(
    () => [hydrated()] as const,
    ([hydrated]) => {
      if (hydrated) {
        document
          .querySelectorAll(`link[${DEV_STYLES_ATTR}]`)
          .forEach((el) => el.remove())
      }
    },
  )

  // Filter out dev styles after hydration
  const filteredTags = createMemo(() => {
    if (hydrated()) {
      return tags().filter(
        (tag) => tag.tag !== 'link' || tag.attrs?.[DEV_STYLES_ATTR] !== true,
      )
    }
    return tags()
  })

  return (
    <>
      <HydrationScript />
      <For each={filteredTags()}>
        {(tag) => {
          const t = tag as any
          return <Asset tag={t.tag} attrs={t.attrs} children={t.children} />
        }}
      </For>
    </>
  )
}
