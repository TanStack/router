import { createJSONSerializer } from '@solidjs/web/serialization'
import { _getRenderedMatches } from '@tanstack/router-core'
import {
  ROUTER_PAYLOAD_GLOBAL,
  ROUTER_PAYLOAD_KEY,
  getRouterPayloadPlugins,
} from './routerPayload'
import type { RouterPayloadRecord } from './routerPayload'
import type {
  AnyRouteMatch,
  AnyRouter,
  AnySerializationAdapter,
  Manifest,
} from '@tanstack/router-core'
import type {
  DehydratedMatch,
  DehydratedRouter,
} from '@tanstack/router-core/ssr/client'

type ServerSsr = NonNullable<AnyRouter['serverSsr']>

// ---------------------------------------------------------------------------
// Mirrors of router-core internals (pending the core-hooks PR against main).
//
// The Solid-side `dehydrate` override must produce the same DehydratedRouter
// core's dehydrate would, and the Solid-side script buffer must present the
// same shell-inline / barrier-deferral behavior core's ScriptBuffer does.
// The pieces below are NOT exported from @tanstack/router-core, so they are
// duplicated here 1:1. Each notes its source. A follow-up core PR will export
// proper hooks and delete these mirrors.
// ---------------------------------------------------------------------------

// Mirror of TSR_SCRIPT_BARRIER_ID (router-core/src/ssr/constants.ts): the id
// of the inline script tag <Scripts /> renders when it drains the buffered
// payload into the shell. renderRouterToStream scans outgoing chunks for it
// to know when post-shell scripts may flow.
const TSR_SCRIPT_BARRIER_ID = '$tsr-stream-barrier'

// Mirror of dehydrateSsrMatchId (router-core/src/ssr/ssr-match-id.ts).
function dehydrateSsrMatchId(id: string): string {
  return id
    .replaceAll('~', '~~')
    .replaceAll('\0', '~0')
    .replaceAll('\uFFFD', '~r')
    .replaceAll('/', '\0')
}

// Mirror of dehydrateMatch (router-core/src/ssr/ssr-server.ts).
function dehydrateMatch(match: AnyRouteMatch): DehydratedMatch {
  const dehydratedMatch: DehydratedMatch = {
    i: dehydrateSsrMatchId(match.id),
    u: match.updatedAt,
    s: match.status,
  }

  const properties = [
    ['__beforeLoadContext', 'b'],
    ['loaderData', 'l'],
    ['error', 'e'],
    ['ssr', 'ssr'],
  ] as const

  for (const [key, shorthand] of properties) {
    // `__beforeLoadContext` is internal to router-core and absent from the
    // public AnyRouteMatch type; the runtime shape carries it.
    const value = (match as unknown as Record<string, unknown>)[key]
    if (value !== undefined) {
      dehydratedMatch[shorthand] = value
    }
  }
  if (match._notFound) {
    dehydratedMatch.g = true
  }
  return dehydratedMatch
}

// Mirror of createInlineCssPlaceholderAsset (router-core/src/manifest.ts):
// the dehydrated manifest ships a contentless inline-style asset; the client
// adopts the server-rendered <style> tag instead of re-shipping the css.
function createInlineCssPlaceholderAsset(): NonNullable<
  Manifest['inlineStyle']
> {
  return {
    attrs: {
      suppressHydrationWarning: true,
    },
  }
}

/**
 * Builds the manifest slice core's dehydrate would ship
 * (`manifestToDehydrate`), without access to the raw ServerManifest (an
 * `attachRouterServerSsrUtils` parameter closed over by core — unreachable
 * from an adapter).
 *
 * Derivation instead of duplication: the public `router.ssr.manifest` getter
 * (also built by attach) already runs the same unexported prep pipeline —
 * `getPreparedMatchedManifestRoutes` (inline-css stripping, prod LRU cache)
 * and `mergeRequestAssetsIntoRootRoute` (request-scoped assets onto the root
 * route). Its output overlays the prepared (stripped) matched routes onto the
 * full route map, so picking the matched ids yields exactly the prepared
 * subset core's dehydrate uses; its `inlineStyle` presence maps to core's
 * placeholder condition; request assets are already merged into the root
 * route, which is always in the matched subset.
 *
 * Known divergences (acceptable, noted for the core-hooks PR):
 * - Shell/SPA mode with inline css: the getter computes inline css over ALL
 *   rendered matches while core's dehydrate would use the root-only slice, so
 *   a placeholder asset may ship where core would omit it (contentless — at
 *   worst an empty adopted <style>).
 * - `dehydrate({ requestAssets })` overrides passed by third-party callers
 *   are ignored; the getter reads the same request assets from the attach
 *   wiring, which is where both Start and createRequestHandler source them.
 */
function deriveManifestToDehydrate(
  router: AnyRouter,
  matchesToDehydrate: Array<AnyRouteMatch>,
): Manifest | undefined {
  const fullManifest = router.ssr?.manifest
  if (!fullManifest) return undefined

  const routes: Manifest['routes'] = {}
  for (const match of matchesToDehydrate) {
    const route = fullManifest.routes[match.routeId]
    if (route) {
      routes[match.routeId] = route
    }
  }

  return {
    ...(fullManifest.scriptFormat
      ? { scriptFormat: fullManifest.scriptFormat }
      : {}),
    ...(fullManifest.inlineStyle
      ? { inlineStyle: createInlineCssPlaceholderAsset() }
      : {}),
    routes,
  }
}

// Mirror of ScriptBuffer (router-core/src/ssr/ssr-server.ts), minus the
// INITIAL_SCRIPTS seeding: the Solid channel carries no executable payload,
// so neither the $R cross-reference scope nor the $_TSR bootstrap exists.
// Buffered scripts inline into the shell via the takeBufferedScripts
// override until the barrier lifts; afterwards they stream through
// injectScript.
class SolidScriptBuffer {
  private injectScript: ((script: string) => void) | undefined
  private _queue: Array<string> = []
  private _scriptBarrierLifted = false
  private _cleanedUp = false
  private _microtaskVersion = 0
  private _pendingMicrotaskVersion = 0

  constructor(injectScript: (script: string) => void) {
    this.injectScript = injectScript
  }

  enqueue(script: string) {
    if (this._cleanedUp) return
    this._queue.push(script)
    if (this._scriptBarrierLifted) {
      this.scheduleInjectBufferedScripts()
    }
  }

  liftBarrier() {
    if (this._scriptBarrierLifted || this._cleanedUp) return
    this._scriptBarrierLifted = true
    if (this._queue.length > 0) {
      this.scheduleInjectBufferedScripts()
    }
  }

  private scheduleInjectBufferedScripts() {
    if (this._pendingMicrotaskVersion !== 0) return
    const pendingVersion = ++this._microtaskVersion
    this._pendingMicrotaskVersion = pendingVersion
    queueMicrotask(() => {
      if (this._pendingMicrotaskVersion !== pendingVersion) return
      this._pendingMicrotaskVersion = 0
      this.injectBufferedScripts()
    })
  }

  private clearPendingMicrotask() {
    if (this._pendingMicrotaskVersion === 0) return
    this._pendingMicrotaskVersion = 0
    this._microtaskVersion++
  }

  /**
   * Flushes any pending scripts synchronously. Call before signaling
   * serialization finished so a held `</body>` tail cannot beat the last
   * payload record. Only injects once the barrier has lifted — before that,
   * scripts must remain queued for takeBufferedScripts().
   */
  flush() {
    if (!this._scriptBarrierLifted) return
    if (this._cleanedUp) return
    this.clearPendingMicrotask()
    this.injectBufferedScripts()
  }

  takeAll() {
    if (this._queue.length === 0) return undefined
    const bufferedScripts = this._queue.splice(0, this._queue.length)
    if (bufferedScripts.length === 1) {
      return bufferedScripts[0] + ';document.currentScript.remove()'
    }
    return bufferedScripts.join(';') + ';document.currentScript.remove()'
  }

  private injectBufferedScripts() {
    if (this._cleanedUp) return
    if (this._queue.length === 0) return
    const scriptsToInject = this.takeAll()
    if (scriptsToInject) {
      this.injectScript?.(scriptsToInject)
    }
  }

  cleanup() {
    this._cleanedUp = true
    this.clearPendingMicrotask()
    this._queue = []
    this.injectScript = undefined
  }
}

// Records are pure JSON data inside an inline <script>; escaping `<` keeps
// `</script>` (and `<!--`) sequences in user strings from terminating the tag.
function recordToScript(record: RouterPayloadRecord): string {
  const json = JSON.stringify(record).replace(/</g, '\\u003c')
  return `(self.${ROUTER_PAYLOAD_GLOBAL}=self.${ROUTER_PAYLOAD_GLOBAL}||[]).push(${json})`
}

/**
 * Replaces the script-channel slice of the (documented framework-only)
 * `ServerSsr` surface with Solid-owned implementations, in place on the same
 * object so every existing holder observes them:
 *
 * - `dehydrate` builds the DehydratedRouter the way core does (rendered
 *   matches, shell slicing, `options.dehydrate()` data, derived manifest) and
 *   serializes it through Solid's JSON codec into a Solid-owned script buffer
 *   — inert `__TSR_P` record pushes instead of `$_TSR` seroval scripts.
 * - `takeBufferedScripts` / `liftScriptBarrier` serve the Solid buffer with
 *   core's exact shell-inline tag shape (barrier id, nonce, self-removal).
 * - `isDehydrated` / `isSerializationFinished` / `onSerializationFinished`
 *   answer from Solid-side state, since core's internal flags never advance
 *   (core's dehydrate never runs).
 * - `setRenderFinished` / `cleanup` wrap the originals: core's render-finished
 *   listeners and cleanup plumbing still run, plus the Solid buffer's barrier
 *   fallback / teardown.
 *
 * Core's seeded bootstrap scripts ($R cross-reference header + $_TSR
 * bootstrap) are drained and discarded up front — the Solid channel has no
 * executable payload, so the SSR HTML carries neither.
 */
export function installSolidSsrTransfer(
  router: AnyRouter,
  serverSsr: ServerSsr,
): void {
  // Discard INITIAL_SCRIPTS from core's script buffer. Core's dehydrate never
  // runs, so nothing else ever enqueues there; draining it now keeps the
  // original setRenderFinished/cleanup paths (still called via the wrappers
  // below) from ever leaking bootstrap scripts into the response.
  serverSsr.takeBufferedScripts()

  const scriptBuffer = new SolidScriptBuffer((script) =>
    serverSsr.injectScript(script),
  )

  let dehydrated = false
  let serializationFinished = false
  let cleanedUp = false
  const serializationFinishedListeners: Array<() => void> = []

  const originalSetRenderFinished = serverSsr.setRenderFinished
  const originalCleanup = serverSsr.cleanup

  const markSerializationFinished = () => {
    if (serializationFinished || cleanedUp) return
    // Flush before signaling so a held tail cannot beat the last record —
    // same ordering contract as core's finishScriptSerialization.
    scriptBuffer.flush()
    serializationFinished = true
    const listeners = serializationFinishedListeners.splice(0)
    for (const l of listeners) {
      try {
        l()
      } catch (err) {
        console.error('Serialization listener error:', err)
      }
    }
  }

  serverSsr.dehydrate = async (opts?: unknown) => {
    void opts
    if (dehydrated) {
      throw new Error(
        process.env.NODE_ENV !== 'production'
          ? 'Invariant failed: router is already dehydrated!'
          : 'Invariant failed',
      )
    }
    // Mirrors core dehydrate's value construction
    // (router-core/src/ssr/ssr-server.ts).
    let matchesToDehydrate = _getRenderedMatches(router.stores.matches.get())
    if (router.isShell()) {
      // In SPA mode we only want to dehydrate the root match
      matchesToDehydrate = matchesToDehydrate.slice(0, 1)
    }
    const matches = matchesToDehydrate.map(dehydrateMatch)
    const manifest = deriveManifestToDehydrate(router, matchesToDehydrate)

    const dehydratedRouter: DehydratedRouter = {
      manifest,
      matches,
    }
    const dehydratedData = await router.options.dehydrate?.()
    if (cleanedUp) {
      return
    }
    if (dehydratedData) {
      dehydratedRouter.dehydratedData = dehydratedData
    }
    dehydrated = true

    const adapters = router.options.serializationAdapters as
      | Array<AnySerializationAdapter>
      | undefined
    const serializer = createJSONSerializer({
      plugins: getRouterPayloadPlugins(adapters),
      onData: (record: RouterPayloadRecord) => {
        scriptBuffer.enqueue(recordToScript(record))
      },
      onDone: () => {
        markSerializationFinished()
      },
      onError: (err: unknown) => {
        console.error('Router payload serialization error:', err)
        markSerializationFinished()
      },
    })

    // Abort pending async serialization (unsettled loaderData promises) when
    // the request ends early; otherwise their continuations would keep
    // writing into a dead channel.
    serverSsr.onCleanup(() => serializer.close())

    serializer.write(ROUTER_PAYLOAD_KEY, dehydratedRouter)
    serializer.flush()
  }

  serverSsr.isDehydrated = () => dehydrated

  serverSsr.isSerializationFinished = () => serializationFinished

  serverSsr.onSerializationFinished = (listener) => {
    if (cleanedUp) return () => {}
    if (serializationFinished) {
      try {
        listener()
      } catch (err) {
        console.error('Serialization listener error:', err)
      }
      return () => {}
    }
    serializationFinishedListeners.push(listener)
    return () => {
      const index = serializationFinishedListeners.indexOf(listener)
      if (index >= 0) serializationFinishedListeners.splice(index, 1)
    }
  }

  serverSsr.takeBufferedScripts = () => {
    const scripts = scriptBuffer.takeAll()
    if (!scripts) return undefined
    // Same tag shape as core's takeBufferedScripts: the barrier id is what
    // renderRouterToStream scans for to lift the script barrier.
    return {
      tag: 'script',
      attrs: {
        nonce: router.options.ssr?.nonce,
        className: '$tsr',
        id: TSR_SCRIPT_BARRIER_ID,
      },
      children: scripts,
    }
  }

  serverSsr.liftScriptBarrier = () => {
    scriptBuffer.liftBarrier()
  }

  serverSsr.setRenderFinished = () => {
    if (cleanedUp) return
    // Core's render-finished listeners (and its—empty—script buffer barrier)
    // still run.
    originalSetRenderFinished()
    // Barrier fallback for renders without <Scripts />, and the synchronous
    // flush renderRouterToString relies on.
    scriptBuffer.liftBarrier()
    if (serializationFinished) {
      scriptBuffer.flush()
    }
  }

  serverSsr.cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    serializationFinishedListeners.length = 0
    scriptBuffer.cleanup()
    // Runs core's cleanup listeners (including the serializer close
    // registered by dehydrate) and detaches router.serverSsr.
    originalCleanup()
  }
}
