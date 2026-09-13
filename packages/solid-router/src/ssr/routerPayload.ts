import { defaultSerovalPlugins, makeSerovalPlugin } from '@tanstack/router-core'
import type { AnySerializationAdapter } from '@tanstack/router-core'
import type { SerializerPlugin } from '@solidjs/web/serialization/decode'

// --- Router payload channel (Solid-owned SSR transfer) ----------------------
//
// The Solid adapter transports the DehydratedRouter through Solid's eval-free
// JSON codec instead of the `$_TSR` script channel: the server serializes the
// VALUE (built by the Solid-side `serverSsr.dehydrate` override, see
// routerPayloadServer) with `createJSONSerializer`, pushing inert SerovalNode
// records into a global queue via inline scripts; the client drains the queue
// through `createJSONDataTable` with the same plugin list at hydrateStart time
// — runtime decode, no parse-time eval. Streamed values (deferred loaderData
// promises) settle through later records, which is the codec's native
// contract.
//
// Everything rides Solid-side overrides of the (documented framework-only)
// `router.serverSsr` members, installed at `onServerSsrAttach` time — core's
// script-channel dehydrate never runs and no non-Solid package changes. A
// follow-up core-hooks PR against `main` will let these overrides collapse
// into supported hooks.

/** Key of the DehydratedRouter in the keyed record space. */
export const ROUTER_PAYLOAD_KEY = 'router'

/** Global queue the server's record scripts push into. */
export const ROUTER_PAYLOAD_GLOBAL = '__TSR_P'

/** Record shape produced by `createJSONSerializer` / consumed by the table. */
export interface RouterPayloadRecord {
  key?: string
  node?: unknown
  initial?: boolean
}

// The tag ReadableStreamPlugin registers under. Solid's JSON codec composes
// DEFAULT_WEB_PLUGINS (which includes it) under any custom list, so the
// router's copy must be dropped or the tag would be registered twice.
const READABLE_STREAM_PLUGIN_TAG = 'seroval/plugins/web/ReadableStream'

/**
 * The plugin list for the router payload codec. Must be identical on both
 * peers: the router's serialization adapters (runtime encode/decode via
 * `makeSerovalPlugin`) plus the router's default plugins, minus the
 * ReadableStream plugin Solid's codec already registers.
 *
 * Both peers read the same merged adapter list (start instance + plugin +
 * server function + router adapters): the server from
 * `router.options.serializationAdapters` (createStartHandler's
 * router.update), the client from `router.options.serializationAdapters`
 * (RouterClient) or `window.__TSS_START_OPTIONS__.serializationAdapters`
 * (hydrateStart, which is the same array instance router.update installs).
 */
export function getRouterPayloadPlugins(
  adapters: Array<AnySerializationAdapter> | undefined,
): Array<SerializerPlugin> {
  // Seroval's own Plugin type and Solid's hand-declared SerializerPlugin
  // mirror describe the same runtime shape; the nominal generics don't
  // overlap structurally, hence the double cast.
  return [
    ...(adapters?.map(makeSerovalPlugin) ?? []),
    ...defaultSerovalPlugins.filter(
      (plugin) => plugin.tag !== READABLE_STREAM_PLUGIN_TAG,
    ),
  ] as unknown as Array<SerializerPlugin>
}
