import { makeSsrSerovalPlugin } from '@tanstack/router-core/ssr/server'
import clientAssetsManifest from './clientAssetsManifest'
import type { renderToStream } from '@solidjs/web'
import type { AnyRouter, AnySerializationAdapter } from '@tanstack/router-core'

// Adapters are module-level singletons, so their SSR plugins are cached per
// adapter rather than rebuilt for every request.
const pluginCache = new WeakMap<
  AnySerializationAdapter,
  ReturnType<typeof makeSsrSerovalPlugin>
>()

function getPlugin(adapter: AnySerializationAdapter) {
  let plugin = pluginCache.get(adapter)
  if (!plugin) {
    plugin = makeSsrSerovalPlugin(adapter)
    pluginCache.set(adapter, plugin)
  }
  return plugin
}

/** Solid renderer options shared by the stream and string paths. */
export function getSolidRenderOptions(router: AnyRouter, manifest?: unknown) {
  return {
    nonce: router.options.ssr?.nonce,
    // `plugins` is honoured by Solid's server runtime but absent from its
    // public option type.
    plugins: router.options.serializationAdapters?.map(getPlugin),
    // Prefer the bundler-provided client-assets bridge (module-keyed, the
    // shape Solid resolves lazy() assets from); the router's route-keyed
    // manifest is a last resort that cannot answer lazy module lookups.
    manifest: manifest ?? clientAssetsManifest ?? router.ssr?.manifest,
  } as Parameters<typeof renderToStream>[1]
}
