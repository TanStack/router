import { AsyncLocalStorage } from 'node:async_hooks'
import { createSerializationAdapter } from '@tanstack/react-router'
import { RawStream } from '@tanstack/router-core'
import { getStartContext } from '@tanstack/start-storage-context'
import {
  setOnClientReference,
  createFromReadableStream as ssrDecode,
} from 'virtual:tanstack-rsc-ssr-decode'
import {
  RENDERABLE_RSC,
  RSC_SLOT_USAGES_STREAM,
  SERVER_COMPONENT_STREAM,
  isServerComponent,
} from './ServerComponentTypes'
import { createRscProxy } from './createRscProxy'
import { awaitLazyElements } from './awaitLazyElements'
import { unwrapRscCssEnvelope } from './rscCssEnvelope'
import type {
  AnyCompositeComponent,
  ServerComponentStream,
} from './ServerComponentTypes'
import type { RscDecodeResult, RscSsrHandler } from './rscSsrHandler'

// ===== SSR Handler Registration =====
// This handler is registered on globalThis for the RSC environment to access.
// The RSC env calls these functions during loader execution to pre-decode streams
// and create renderable proxies.
//
// This MUST happen in a module without 'use client' directive.
// Modules with 'use client' may be transformed to client references in the
// SSR environment when RSC is enabled, preventing the side effect from running.

// AsyncLocalStorage for decode-scoped CSS collector.
// Each decode() runs in its own async context with its own collector.
// The onClientReference callback reads from this to write CSS hrefs.
const decodeCollectorStorage = new AsyncLocalStorage<Set<string>>()
const jsCollectorStorage = new AsyncLocalStorage<Set<string>>()

setOnClientReference(
  ({
    deps,
    runtime,
  }: {
    deps: { js: Array<string>; css: Array<string> }
    runtime?: 'rsbuild'
  }) => {
    const ctx = getStartContext({ throwIfNotFound: false })

    const cssCollector = decodeCollectorStorage.getStore()
    if (cssCollector) {
      for (const href of deps.css) {
        cssCollector.add(href)
      }
    }

    const jsCollector = jsCollectorStorage.getStore()
    if (jsCollector) {
      for (const href of deps.js) {
        jsCollector.add(href)
      }
    }

    if (!ctx || runtime === 'rsbuild') return

    if (!ctx.requestAssets) ctx.requestAssets = []
    const seenHrefs = new Set<string>()
    for (const asset of ctx.requestAssets) {
      if (asset.tag === 'link' && asset.attrs?.href) {
        seenHrefs.add(asset.attrs.href as string)
      }
    }

    for (const href of deps.js) {
      if (seenHrefs.has(href)) continue
      seenHrefs.add(href)
      ctx.requestAssets.push({
        tag: 'link',
        attrs: { rel: 'modulepreload', href },
      })
    }

    for (const href of deps.css) {
      if (seenHrefs.has(href)) continue
      seenHrefs.add(href)
      ctx.requestAssets.push({
        tag: 'link',
        attrs: { rel: 'preload', href, as: 'style' },
      })
    }
  },
)

const ssrHandler: RscSsrHandler = {
  async decode(stream: ServerComponentStream): Promise<RscDecodeResult> {
    const readableStream = stream.createReplayStream()

    // Create a collector for this decode operation.
    // Run the decode in an AsyncLocalStorage context so the onClientReference
    // callback can write to this specific collector even with parallel decodes.
    const cssCollector = new Set<string>()
    const jsCollector = new Set<string>()

    return decodeCollectorStorage.run(cssCollector, async () => {
      return jsCollectorStorage.run(jsCollector, async () => {
        const decodedTree = await ssrDecode(readableStream)
        await awaitLazyElements(decodedTree, (href) => {
          cssCollector.add(href)
        })

        return {
          tree: unwrapRscCssEnvelope(decodedTree),
          cssHrefs: cssCollector.size > 0 ? cssCollector : undefined,
          jsPreloads: jsCollector.size > 0 ? jsCollector : undefined,
        }
      })
    })
  },

  createRenderableProxy(stream, decoded): any {
    return createRscProxy(() => decoded.tree, {
      stream,
      cssHrefs: decoded.cssHrefs,
      jsPreloads: decoded.jsPreloads,
      renderable: true,
    })
  },

  createCompositeProxy(
    stream,
    decoded,
    slotUsagesStream,
  ): AnyCompositeComponent {
    const proxy = createRscProxy(() => decoded.tree, {
      stream,
      cssHrefs: decoded.cssHrefs,
      jsPreloads: decoded.jsPreloads,
      renderable: false,
      slotUsagesStream,
    })
    return proxy
  },
}

// Register SSR handler on globalThis for RSC environment to access.
globalThis.__RSC_SSR__ = ssrHandler

// ===== End SSR Handler Registration =====

/**
 * Helper to check if a value is a renderable RSC (from renderServerComponent).
 * The value can be either an object (proxy target) or a function (stub for server functions).
 */
function isRenderableRsc(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value !== 'object' && typeof value !== 'function') return false
  return RENDERABLE_RSC in value && (value as any)[RENDERABLE_RSC] === true
}

/**
 * Server-side serialization adapter for RSC (renderable + composite).
 */
const adapter = createSerializationAdapter({
  key: '$RSC',
  test: (value: unknown): value is AnyCompositeComponent => {
    return isServerComponent(value)
  },
  toSerializable: (component: AnyCompositeComponent) => {
    const stream = component[SERVER_COMPONENT_STREAM]!.createReplayStream()

    const kind = isRenderableRsc(component) ? 'renderable' : 'composite'

    const slotUsagesStream =
      kind === 'composite' &&
      process.env.NODE_ENV === 'development' &&
      RSC_SLOT_USAGES_STREAM in component
        ? ((component as any)[RSC_SLOT_USAGES_STREAM] as unknown as
            | ReadableStream<any>
            | undefined)
        : undefined

    return {
      kind,
      stream: new RawStream(stream, { hint: 'text' }),
      slotUsagesStream,
    }
  },
  fromSerializable: (): never => {
    throw new Error('Server should never deserialize RSC data')
  },
})

/**
 * Factory function for server-side RSC serialization adapter.
 */
export const rscSerializationAdapter = () => [adapter]
