import { MetaProvider } from '@solidjs/meta'
import { For, createEffect, createMemo } from 'solid-js'
import { Asset } from './Asset'
import { useHydrated } from './ClientOnly'
import { useTags } from './headContentUtils'

const DEV_STYLES_ATTR = 'data-tanstack-router-dev-styles'

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 * When using full document hydration (hydrating from `<html>`), this component should be rendered in the `<body>`
 * to ensure it's part of the reactive tree and updates correctly during client-side navigation.
 * The component uses portals internally to render content into the `<head>` element.
 *
 * Development version: filters out dev styles link after hydration and
 * includes a fallback cleanup effect for hydration mismatch cases.
 */
export function HeadContent() {
  const tags = useTags()
  const hydrated = useHydrated()

  // Fallback cleanup for hydration mismatch cases
  // Runs when hydration completes to remove any orphaned dev styles links from DOM
  createEffect(() => {
    if (hydrated()) {
      document
        .querySelectorAll(`link[${DEV_STYLES_ATTR}]`)
        .forEach((el) => el.remove())
    }
  })

  // Filter out dev styles after hydration
  const filteredTags = createMemo(() => {
    if (hydrated()) {
      return tags().filter((tag) => !tag.attrs?.[DEV_STYLES_ATTR])
    }
    return tags()
  })

  return (
    <MetaProvider>
      <For each={filteredTags()}>{(tag) => <Asset {...tag} />}</For>
    </MetaProvider>
  )
}
