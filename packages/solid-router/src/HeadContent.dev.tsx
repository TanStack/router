import { MetaProvider } from '@solidjs/meta'
import { For, createMemo, createSignal, onCleanup } from 'solid-js'
import { DEV_STYLES_ATTR, DEV_STYLES_STALE_EVENT } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useTags } from './headContentUtils'
import type { HeadContentProps } from './HeadContent'

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 * When using full document hydration (hydrating from `<html>`), this component should be rendered in the `<body>`
 * to ensure it's part of the reactive tree and updates correctly during client-side navigation.
 * The component uses portals internally to render content into the `<head>` element.
 *
 * Development version: keeps the SSR dev styles link until an HMR update makes
 * it stale. Removing it at hydration would unstyle server-rendered content
 * whose modules are still loading (e.g. lazy components inside Suspense).
 */
export function HeadContent(props: HeadContentProps) {
  const tags = useTags(props.assetCrossOrigin)
  const router = useRouter()

  if (isServer ?? router.isServer) {
    return (
      <MetaProvider>
        <For each={tags()}>{(tag) => <Asset {...tag} />}</For>
      </MetaProvider>
    )
  }

  const [stale, setStale] = createSignal(false)
  const markStale = () => {
    setStale(true)
    // Also drop links that are not owned by this component (hydration mismatch)
    document
      .querySelectorAll(`link[${DEV_STYLES_ATTR}]`)
      .forEach((el) => el.remove())
  }
  window.addEventListener(DEV_STYLES_STALE_EVENT, markStale)
  onCleanup(() => window.removeEventListener(DEV_STYLES_STALE_EVENT, markStale))

  const filteredTags = createMemo(() => {
    if (stale()) {
      return tags().filter(
        (tag) => tag.tag !== 'link' || tag.attrs?.[DEV_STYLES_ATTR] !== true,
      )
    }
    return tags()
  })

  return (
    <MetaProvider>
      <For each={filteredTags()}>{(tag) => <Asset {...tag} />}</For>
    </MetaProvider>
  )
}
