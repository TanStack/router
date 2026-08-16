import { HydrationScript, useHead } from '@solidjs/web'
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

  useHead(() => toHeadTags(tags()))

  return <HydrationScript />
}
