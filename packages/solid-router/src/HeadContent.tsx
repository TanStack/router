import { createEffect, createMemo } from 'solid-js'
import { HydrationScript, useHead } from '@solidjs/web'
import { DEV_STYLES_ATTR } from '@tanstack/router-core'
import { useHydrated } from './ClientOnly'
import { toHeadTags, useTags } from './headContentUtils'
import type { AssetCrossOriginConfig } from '@tanstack/router-core'

export interface HeadContentProps {
  assetCrossOrigin?: AssetCrossOriginConfig
}

/**
 * @description The `HeadContent` component registers the current route's meta
 * tags, links, and scripts with Solid's head registry, which owns emission
 * into `<head>` (SSR splicing/streaming and client-side patching alike). It
 * can be rendered anywhere in the tree, though placing it inside the `<head>`
 * of your document keeps the hydration script in the right place.
 */
export function HeadContent(props: HeadContentProps) {
  const tags = useTags(props.assetCrossOrigin)
  const hydrated = useHydrated()

  // Dev-styles handling (no-op in production builds, where no
  // DEV_STYLES_ATTR links exist): the dev server SSRs route CSS as marked
  // links to avoid FOUC, and Vite's own style injection takes over after
  // hydration. Drop them from the registered tags once hydrated, and sweep
  // any orphans left behind by hydration mismatches.
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

  const filteredTags = createMemo(() => {
    if (hydrated()) {
      return tags().filter(
        (tag) => tag.tag !== 'link' || tag.attrs?.[DEV_STYLES_ATTR] !== true,
      )
    }
    return tags()
  })

  useHead(() => toHeadTags(filteredTags()))

  return <HydrationScript />
}
