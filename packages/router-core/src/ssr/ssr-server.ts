import { crossSerializeStream, getCrossReferenceHeader } from 'seroval'
import invariant from 'tiny-invariant'
import { decodePath } from '../utils'
import { createLRUCache } from '../lru-cache'
import minifiedTsrBootStrapScript from './tsrScript?script-string'
import { GLOBAL_TSR, TSR_SCRIPT_BARRIER_ID } from './constants'
import { defaultSerovalPlugins } from './serializer/seroval-plugins'
import { makeSsrSerovalPlugin } from './serializer/transformer'
import type { LRUCache } from '../lru-cache'
import type { DehydratedMatch, DehydratedRouter } from './types'
import type { AnySerializationAdapter } from './serializer/transformer'
import type { AnyRouter } from '../router'
import type { AnyRouteMatch } from '../Matches'
import type { Manifest, RouterManagedTag } from '../manifest'

declare module '../router' {
  interface ServerSsr {
    setRenderFinished: () => void
    cleanup: () => void
  }
  interface RouterEvents {
    onInjectedHtml: {
      type: 'onInjectedHtml'
    }
    onSerializationFinished: {
      type: 'onSerializationFinished'
    }
  }
}

const SCOPE_ID = 'tsr'

const TSR_PREFIX = GLOBAL_TSR + '.router='
const P_PREFIX = GLOBAL_TSR + '.p(()=>'
const P_SUFFIX = ')'

export function dehydrateMatch(match: AnyRouteMatch): DehydratedMatch {
  const dehydratedMatch: DehydratedMatch = {
    i: match.id,
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
    if (match[key] !== undefined) {
      dehydratedMatch[shorthand] = match[key]
    }
  }
  return dehydratedMatch
}

const INITIAL_SCRIPTS = [
  getCrossReferenceHeader(SCOPE_ID),
  minifiedTsrBootStrapScript,
]

class ScriptBuffer {
  private router: AnyRouter | undefined
  private _queue: Array<string>
  private _scriptBarrierLifted = false
  private _cleanedUp = false
  private _pendingMicrotask = false

  constructor(router: AnyRouter) {
    this.router = router
    // Copy INITIAL_SCRIPTS to avoid mutating the shared array
    this._queue = INITIAL_SCRIPTS.slice()
  }

  enqueue(script: string) {
    if (this._cleanedUp) return
    this._queue.push(script)
    // If barrier is lifted, schedule injection (if not already scheduled)
    if (this._scriptBarrierLifted && !this._pendingMicrotask) {
      this._pendingMicrotask = true
      queueMicrotask(() => {
        this._pendingMicrotask = false
        this.injectBufferedScripts()
      })
    }
  }

  liftBarrier() {
    if (this._scriptBarrierLifted || this._cleanedUp) return
    this._scriptBarrierLifted = true
    if (this._queue.length > 0 && !this._pendingMicrotask) {
      this._pendingMicrotask = true
      queueMicrotask(() => {
        this._pendingMicrotask = false
        this.injectBufferedScripts()
      })
    }
  }

  /**
   * Flushes any pending scripts synchronously.
   * Call this before emitting onSerializationFinished to ensure all scripts are injected.
   *
   * IMPORTANT: Only injects if the barrier has been lifted. Before the barrier is lifted,
   * scripts should remain in the queue so takeBufferedScripts() can retrieve them
   */
  flush() {
    if (!this._scriptBarrierLifted) return
    if (this._cleanedUp) return
    this._pendingMicrotask = false
    const scriptsToInject = this.takeAll()
    if (scriptsToInject && this.router?.serverSsr) {
      this.router.serverSsr.injectScript(scriptsToInject)
    }
  }

  takeAll() {
    const bufferedScripts = this._queue
    this._queue = []
    if (bufferedScripts.length === 0) {
      return undefined
    }
    // Optimization: if only one script, avoid join
    if (bufferedScripts.length === 1) {
      return bufferedScripts[0] + ';document.currentScript.remove()'
    }
    // Append cleanup script and join - avoid push() to not mutate then iterate
    return bufferedScripts.join(';') + ';document.currentScript.remove()'
  }

  injectBufferedScripts() {
    if (this._cleanedUp) return
    // Early return if queue is empty (avoids unnecessary takeAll() call)
    if (this._queue.length === 0) return
    const scriptsToInject = this.takeAll()
    if (scriptsToInject && this.router?.serverSsr) {
      this.router.serverSsr.injectScript(scriptsToInject)
    }
  }

  cleanup() {
    this._cleanedUp = true
    this._queue = []
    this.router = undefined
  }
}

const isProd = process.env.NODE_ENV === 'production'

type FilteredRoutes = Manifest['routes']

type ManifestLRU = LRUCache<string, FilteredRoutes>

const MANIFEST_CACHE_SIZE = 100
const manifestCaches = new WeakMap<Manifest, ManifestLRU>()

function getManifestCache(manifest: Manifest): ManifestLRU {
  const cache = manifestCaches.get(manifest)
  if (cache) return cache
  const newCache = createLRUCache<string, FilteredRoutes>(MANIFEST_CACHE_SIZE)
  manifestCaches.set(manifest, newCache)
  return newCache
}

export function attachRouterServerSsrUtils({
  router,
  manifest,
}: {
  router: AnyRouter
  manifest: Manifest | undefined
}) {
  router.ssr = {
    manifest,
  }
  let _dehydrated = false
  let _serializationFinished = false
  const renderFinishedListeners: Array<() => void> = []
  const serializationFinishedListeners: Array<() => void> = []
  const scriptBuffer = new ScriptBuffer(router)
  let injectedHtmlBuffer = ''

  router.serverSsr = {
    injectHtml: (html: string) => {
      if (!html) return
      // Buffer the HTML so it can be retrieved via takeBufferedHtml()
      injectedHtmlBuffer += html
      // Emit event to notify subscribers that new HTML is available
      router.emit({
        type: 'onInjectedHtml',
      })
    },
    injectScript: (script: string) => {
      if (!script) return
      const html = `<script${router.options.ssr?.nonce ? ` nonce='${router.options.ssr.nonce}'` : ''}>${script}</script>`
      router.serverSsr!.injectHtml(html)
    },
    dehydrate: async () => {
      invariant(!_dehydrated, 'router is already dehydrated!')
      let matchesToDehydrate = router.state.matches
      if (router.isShell()) {
        // In SPA mode we only want to dehydrate the root match
        matchesToDehydrate = matchesToDehydrate.slice(0, 1)
      }
      const matches = matchesToDehydrate.map(dehydrateMatch)

      let manifestToDehydrate: Manifest | undefined = undefined
      // For currently matched routes, send full manifest (preloads + assets)
      // For all other routes, only send assets (no preloads as they are handled via dynamic imports)
      if (manifest) {
        // Prod-only caching; in dev manifests may be replaced/updated (HMR)
        const currentRouteIdsList = matchesToDehydrate.map((m) => m.routeId)
        const manifestCacheKey = currentRouteIdsList.join('\0')

        let filteredRoutes: FilteredRoutes | undefined

        if (isProd) {
          filteredRoutes = getManifestCache(manifest).get(manifestCacheKey)
        }

        if (!filteredRoutes) {
          const currentRouteIds = new Set(currentRouteIdsList)
          const nextFilteredRoutes: FilteredRoutes = {}

          for (const routeId in manifest.routes) {
            const routeManifest = manifest.routes[routeId]!
            if (currentRouteIds.has(routeId)) {
              nextFilteredRoutes[routeId] = routeManifest
            } else if (
              routeManifest.assets &&
              routeManifest.assets.length > 0
            ) {
              nextFilteredRoutes[routeId] = {
                assets: routeManifest.assets,
              }
            }
          }

          if (isProd) {
            getManifestCache(manifest).set(manifestCacheKey, nextFilteredRoutes)
          }

          filteredRoutes = nextFilteredRoutes
        }

        manifestToDehydrate = {
          routes: filteredRoutes,
        }
      }
      const dehydratedRouter: DehydratedRouter = {
        manifest: manifestToDehydrate,
        matches,
      }
      const lastMatchId = matchesToDehydrate[matchesToDehydrate.length - 1]?.id
      if (lastMatchId) {
        dehydratedRouter.lastMatchId = lastMatchId
      }
      const dehydratedData = await router.options.dehydrate?.()
      if (dehydratedData) {
        dehydratedRouter.dehydratedData = dehydratedData
      }
      _dehydrated = true

      const trackPlugins = { didRun: false }
      const serializationAdapters = router.options.serializationAdapters as
        | Array<AnySerializationAdapter>
        | undefined
      const plugins = serializationAdapters
        ? serializationAdapters
            .map((t) => makeSsrSerovalPlugin(t, trackPlugins))
            .concat(defaultSerovalPlugins)
        : defaultSerovalPlugins

      const signalSerializationComplete = () => {
        _serializationFinished = true
        try {
          serializationFinishedListeners.forEach((l) => l())
          router.emit({ type: 'onSerializationFinished' })
        } catch (err) {
          console.error('Serialization listener error:', err)
        } finally {
          serializationFinishedListeners.length = 0
          renderFinishedListeners.length = 0
        }
      }

      crossSerializeStream(dehydratedRouter, {
        refs: new Map(),
        plugins,
        onSerialize: (data, initial) => {
          let serialized = initial ? TSR_PREFIX + data : data
          if (trackPlugins.didRun) {
            serialized = P_PREFIX + serialized + P_SUFFIX
          }
          scriptBuffer.enqueue(serialized)
        },
        scopeId: SCOPE_ID,
        onDone: () => {
          scriptBuffer.enqueue(GLOBAL_TSR + '.e()')
          // Flush all pending scripts synchronously before signaling completion
          // This ensures all scripts are injected before onSerializationFinished is emitted
          scriptBuffer.flush()
          signalSerializationComplete()
        },
        onError: (err) => {
          console.error('Serialization error:', err)
          signalSerializationComplete()
        },
      })
    },
    isDehydrated() {
      return _dehydrated
    },
    isSerializationFinished() {
      return _serializationFinished
    },
    onRenderFinished: (listener) => renderFinishedListeners.push(listener),
    onSerializationFinished: (listener) =>
      serializationFinishedListeners.push(listener),
    setRenderFinished: () => {
      // Wrap in try-catch to ensure scriptBuffer.liftBarrier() is always called
      try {
        renderFinishedListeners.forEach((l) => l())
      } catch (err) {
        console.error('Error in render finished listener:', err)
      } finally {
        // Clear listeners after calling them to prevent memory leaks
        renderFinishedListeners.length = 0
      }
      scriptBuffer.liftBarrier()
    },
    takeBufferedScripts() {
      const scripts = scriptBuffer.takeAll()
      const serverBufferedScript: RouterManagedTag = {
        tag: 'script',
        attrs: {
          nonce: router.options.ssr?.nonce,
          className: '$tsr',
          id: TSR_SCRIPT_BARRIER_ID,
        },
        children: scripts,
      }
      return serverBufferedScript
    },
    liftScriptBarrier() {
      scriptBuffer.liftBarrier()
    },
    takeBufferedHtml() {
      if (!injectedHtmlBuffer) {
        return undefined
      }
      const buffered = injectedHtmlBuffer
      injectedHtmlBuffer = ''
      return buffered
    },
    cleanup() {
      // Guard against multiple cleanup calls
      if (!router.serverSsr) return
      renderFinishedListeners.length = 0
      serializationFinishedListeners.length = 0
      injectedHtmlBuffer = ''
      scriptBuffer.cleanup()
      router.serverSsr = undefined
    },
  }
}

/**
 * Get the origin for the request.
 *
 * SECURITY: We intentionally do NOT trust the Origin header for determining
 * the router's origin. The Origin header can be spoofed by attackers, which
 * could lead to SSRF-like vulnerabilities where redirects are constructed
 * using a malicious origin (CVE-2024-34351).
 *
 * Instead, we derive the origin from request.url, which is typically set by
 * the server infrastructure (not client-controlled headers).
 *
 * For applications behind proxies that need to trust forwarded headers,
 * use the router's `origin` option to explicitly configure a trusted origin.
 */
export function getOrigin(request: Request) {
  try {
    return new URL(request.url).origin
  } catch {}
  return 'http://localhost'
}

// server and browser can decode/encode characters differently in paths and search params.
// Server generally strictly follows the WHATWG URL Standard, while browsers may differ for legacy reasons.
// for example, in paths "|" is not encoded on the server but is encoded on chromium (and not on firefox) while "대" is encoded on both sides.
// Another anomaly is that in Node new URLSearchParams and new URL also decode/encode characters differently.
// new URLSearchParams() encodes "|" while new URL() does not, and in this instance
// chromium treats search params differently than paths, i.e. "|" is not encoded in search params.
export function getNormalizedURL(url: string | URL, base?: string | URL) {
  // ensure backslashes are encoded correctly in the URL
  if (typeof url === 'string') url = url.replace('\\', '%5C')

  const rawUrl = new URL(url, base)
  const { path: decodedPathname, handledProtocolRelativeURL } = decodePath(
    rawUrl.pathname,
  )
  const searchParams = new URLSearchParams(rawUrl.search)
  const normalizedHref =
    decodedPathname +
    (searchParams.size > 0 ? '?' : '') +
    searchParams.toString() +
    rawUrl.hash

  return {
    url: new URL(normalizedHref, rawUrl.origin),
    handledProtocolRelativeURL,
  }
}
