import {
  ROUTER_PAYLOAD_GLOBAL,
  ROUTER_PAYLOAD_KEY,
  getRouterPayloadPlugins,
} from './routerPayload'
import type { RouterPayloadRecord } from './routerPayload'
import type { AnyRouter, AnySerializationAdapter } from '@tanstack/router-core'
import type {
  DehydratedRouter,
  TsrSsrGlobal,
} from '@tanstack/router-core/ssr/client'

type DecodeModule = typeof import('@solidjs/web/serialization/decode')

// The decode module is loaded dynamically, NOT statically: Solid's own web
// runtime lazy-loads it (`import('@solidjs/web/serialization/decode')` when a
// hydration payload exists), so a static import here would merge the decode
// module into whatever chunk imports this file — for apps on solid-start's
// default client entry, the entry chunk itself. The entry chunk then shows up
// as a dynamic-import target (of Solid's lazy decode load), and the Solid
// vite plugin's lazy-entry normalization strips its `isEntry` flag, breaking
// Start's manifest capture ("No entry file found"). Loading through the same
// dynamic specifier shares Solid's decode chunk instead.
let decodeModule: DecodeModule | undefined
let decodeModulePromise: Promise<void> | undefined

function loadDecodeModule(): Promise<void> {
  return (decodeModulePromise ??= import(
    '@solidjs/web/serialization/decode'
  ).then((mod) => {
    decodeModule = mod
  }))
}

/**
 * Reads the Solid-transferred DehydratedRouter from the record queue the
 * server's inline scripts pushed into (`self.__TSR_P`).
 *
 * Called lazily — after the router's serialization adapters are finalized
 * (router creation for RouterClient, hydrateStart's `router.update` for
 * Start), so the decode plugin list matches what the server encoded with.
 * Records that arrive after this runs (streamed loaderData resolutions on a
 * still-open response) feed the same decode table through the hooked `push`,
 * settling the promises the initial record referenced.
 *
 * Requires the decode module to be loaded — `installRouterPayloadShim`'s
 * promise (which callers await before core hydrate) resolves after the load.
 *
 * Returns `undefined` when no queue exists (no SSR payload).
 */
export function readRouterPayloadFromAdapters(
  adapters: Array<AnySerializationAdapter> | undefined,
): DehydratedRouter | undefined {
  const queue = (globalThis as any)[ROUTER_PAYLOAD_GLOBAL] as
    | Array<RouterPayloadRecord>
    | undefined
  if (!queue) return undefined

  if (!decodeModule) {
    throw new Error(
      'Router payload decode module not loaded — await the promise returned ' +
        'by installRouterPayloadShim before hydrating',
    )
  }
  const table = decodeModule.createJSONDataTable({
    plugins: getRouterPayloadPlugins(adapters),
  })
  for (const record of queue) table.apply(record)
  // Late records decode on arrival instead of queueing.
  queue.push = (record: RouterPayloadRecord) => {
    table.apply(record)
    return 0
  }

  return table.resolve<DehydratedRouter | undefined>({
    $ref: ROUTER_PAYLOAD_KEY,
  })
}

export function readRouterPayload(
  router: AnyRouter,
): DehydratedRouter | undefined {
  return readRouterPayloadFromAdapters(
    router.options.serializationAdapters as
      | Array<AnySerializationAdapter>
      | undefined,
  )
}

/**
 * Installs a synthetic `window.$_TSR` so the unchanged core `hydrate()` reads
 * the Solid-decoded payload instead of the script channel. Core hydrate's
 * bootstrap contract: it sets `tsr.t` (adapter map), replays `tsr.buffer`,
 * sets `tsr.initialized`, then reads `tsr.router` — the lazy getter decodes
 * the `__TSR_P` record queue at that final read, by which point the caller's
 * adapter source (see `readPayload`) is fully populated. Everything is
 * constructed from decoded JSON records; no script-channel eval.
 *
 * `h()` (the hydration-complete signal the caller fires after core hydrate)
 * deletes the synthetic global, mirroring the observable end state of core's
 * bootstrap (which deletes `$_TSR` once hydrated + stream ended). The
 * synthetic has no post-hydration role — late records ride the `__TSR_P`
 * queue's hooked `push`, never `$_TSR.p` — so hydration completion alone is
 * the deletion point. `typeof window.$_TSR === 'undefined'` therefore stays
 * a valid "hydration finished" probe on both channels.
 *
 * Returns a promise that resolves once the payload decoder is ready (loaded
 * lazily to share Solid's own decode chunk — see `loadDecodeModule`). Await
 * it before running core hydrate.
 *
 * No-op when `window.$_TSR` already exists: a document rendered by a
 * script-channel server (e.g. an older deploy) defined the real bootstrap in
 * its shell, and core hydrate should read that instead.
 */
export function installRouterPayloadShim(
  readPayload: () => DehydratedRouter | undefined,
): Promise<void> {
  if (window.$_TSR) return Promise.resolve()

  let decoded: DehydratedRouter | undefined
  let decodeRan = false
  const noop = () => {}
  const synthetic: TsrSsrGlobal = {
    get router() {
      if (!decodeRan) {
        decodeRan = true
        decoded = readPayload()
      }
      return decoded
    },
    buffer: [],
    initialized: false,
    h: () => {
      if (window.$_TSR === synthetic) {
        delete (window as { $_TSR?: TsrSsrGlobal }).$_TSR
      }
    },
    e: noop,
    c: noop,
    p: (script: () => void) => script(),
  }
  window.$_TSR = synthetic

  // Only payload-carrying documents need the decoder.
  if (!(globalThis as any)[ROUTER_PAYLOAD_GLOBAL]) return Promise.resolve()
  return loadDecodeModule()
}
