'use client'

import * as React from 'react'
import { DEV_STYLES_ATTR, DEV_STYLES_STALE_EVENT } from '@tanstack/router-core'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useTags } from './headContentUtils'
import type { HeadContentProps } from './HeadContent'

// Tracked at module level so an update applied before HeadContent mounts is not missed.
let devStylesStale = false

function subscribeDevStylesStale(onChange: () => void) {
  const listener = () => {
    devStylesStale = true
    onChange()
  }
  window.addEventListener(DEV_STYLES_STALE_EVENT, listener)
  return () => window.removeEventListener(DEV_STYLES_STALE_EVENT, listener)
}

/**
 * Render route-managed head tags (title, meta, links, styles, head scripts).
 * Place inside the document head of your app shell.
 *
 * Development version: keeps the SSR dev styles link until an HMR update makes
 * it stale. Removing it at hydration would unstyle server-rendered content
 * whose modules are still loading (e.g. `React.lazy` inside Suspense).
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/document-head-management
 */
export function HeadContent(props: HeadContentProps) {
  const tags = useTags(props.assetCrossOrigin)
  const router = useRouter()
  const nonce = router.options.ssr?.nonce
  const stale = React.useSyncExternalStore(
    subscribeDevStylesStale,
    () => devStylesStale,
    () => false,
  )

  // Stylesheet links are hoisted resources that React does not remove when
  // they are filtered out, so drop them from the DOM explicitly.
  React.useEffect(() => {
    if (stale) {
      document
        .querySelectorAll(`link[${DEV_STYLES_ATTR}]`)
        .forEach((el) => el.remove())
    }
  }, [stale])

  const filteredTags = stale
    ? tags.filter(
        (tag) => tag.tag !== 'link' || tag.attrs?.[DEV_STYLES_ATTR] !== true,
      )
    : tags

  return (
    <>
      {filteredTags.map((tag) => (
        <Asset {...tag} key={`tsr-meta-${JSON.stringify(tag)}`} nonce={nonce} />
      ))}
    </>
  )
}
