import { For } from 'solid-js'
import { HydrationScript, NoHydration } from '@solidjs/web'
import { Asset } from './Asset'
import { useTags } from './headContentUtils'
import type { AssetCrossOriginConfig } from '@tanstack/router-core'

// Solid v2 serializes the initial resource-hydration data (which embeds the
// serialization-adapter deserialization calls `$_TSR.t.get(key)(value)`)
// *eagerly and early* — before the `$_TSR` bootstrap that the framework-agnostic
// stream transform injects later in the body. Those eager calls would otherwise
// throw `$_TSR is not defined`.
//
// This stub, rendered as the very first thing in <head> (before any of Solid's
// resource serialization), defines a minimal `$_TSR` whose `.t.get(key)(value)`
// returns a Promise and queues the real deserialization onto `window.$_TSR_d`.
// `solid-start-client`'s `hydrateStart` flushes that queue once the real adapter
// map is installed, resolving each Promise with the deserialized value. The
// `<Await>` async memo awaits these Promises, so the resolved values land
// correctly. The later body-injected bootstrap overwrites `self.$_TSR`, which is
// fine: the deferral queue lives on the separate `$_TSR_d` global.
const TSR_DEFER_STUB = `self.$_TSR=self.$_TSR||{},self.$_TSR.t=self.$_TSR.t||{get:function(k){return function(v){var r,p=new Promise(function(x){r=x});(self.$_TSR_d=self.$_TSR_d||[]).push(function(t){r(t.get(k)(v))});return p}}}`

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
      <NoHydration>
        <script>{TSR_DEFER_STUB}</script>
      </NoHydration>
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
