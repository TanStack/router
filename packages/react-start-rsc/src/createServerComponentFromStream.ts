'use client'

import { use } from 'react'
import { createFromReadableStream as browserDecode } from 'virtual:tanstack-rsc-browser-decode'

import { awaitLazyElements } from './awaitLazyElements'
import { createRscProxy } from './createRscProxy'
import { unwrapRscCssEnvelope } from './rscCssEnvelope'
import type {
  AnyCompositeComponent,
  RscSlotUsageEvent,
  ServerComponentStream,
} from './ServerComponentTypes'

type StreamDecodeOptions = {
  cssHrefs?: Iterable<string>
  jsPreloads?: Iterable<string>
}

/**
 * Creates a renderable RSC proxy from a raw Flight stream.
 * Client-side only - used by the client serialization adapter for `renderServerComponent`.
 *
 * Returns a Proxy that:
 * - Can be rendered directly as `{data}` in JSX
 * - Supports nested access: `{data.foo.bar}`
 * - Masquerades as a React element
 */
export function createRenderableFromStream(
  stream: ReadableStream<Uint8Array>,
  options?: StreamDecodeOptions,
): any {
  const { getTree, streamWrapper, cssHrefs, jsPreloads } = setupStreamDecode(
    stream,
    options,
  )

  return createRscProxy(getTree, {
    stream: streamWrapper,
    cssHrefs,
    jsPreloads,
    renderable: true,
  })
}

/**
 * Creates a composite RSC proxy from a raw Flight stream.
 * Client-side only - used by the client serialization adapter for `createCompositeComponent`.
 *
 * Returns a Proxy that:
 * - NOT directly renderable
 * - Supports nested access: `src.foo.bar`
 * - Must be rendered via `<CompositeComponent src={...} />`
 */
export function createCompositeFromStream(
  stream: ReadableStream<Uint8Array>,
  options?: {
    slotUsagesStream?: ReadableStream<RscSlotUsageEvent>
  } & StreamDecodeOptions,
): AnyCompositeComponent {
  const { getTree, streamWrapper, cssHrefs, jsPreloads } = setupStreamDecode(
    stream,
    options,
  )

  return createRscProxy(getTree, {
    stream: streamWrapper,
    cssHrefs,
    jsPreloads,
    renderable: false,
    slotUsagesStream: options?.slotUsagesStream,
  })
}

/**
 * Shared stream decode setup for both renderable and composite.
 */
function setupStreamDecode(
  stream: ReadableStream<Uint8Array>,
  options?: StreamDecodeOptions,
): {
  getTree: () => unknown
  streamWrapper: ServerComponentStream
  cssHrefs: Set<string>
  jsPreloads: Set<string> | undefined
} {
  const cssHrefs = new Set(options?.cssHrefs ?? [])
  const jsPreloads = options?.jsPreloads
    ? new Set(options.jsPreloads)
    : undefined

  // Synchronous cache for the decoded tree.
  let cachedTree: unknown = undefined
  let cacheReady = false
  let transformedTreePromise: Promise<unknown> | undefined

  const startDecode = () => {
    if (!transformedTreePromise) {
      // Promise for the tree with lazy elements awaited.
      transformedTreePromise = Promise.resolve(browserDecode(stream)).then(
        async (result) => {
          await awaitLazyElements(result, (href) => {
            cssHrefs.add(href)
          })
          cachedTree = unwrapRscCssEnvelope(result)
          cacheReady = true
          return cachedTree
        },
      )
    }

    return transformedTreePromise
  }

  const streamWrapper: ServerComponentStream = {
    createReplayStream: () => stream,
  }

  const getTree = () => {
    if (cacheReady) return cachedTree
    // Decoding loads client modules and their CSS, so wait until this stream
    // is rendered even when SSR asset metadata is absent.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return use(startDecode())
  }

  return { getTree, streamWrapper, cssHrefs, jsPreloads }
}
// Legacy export for backwards compatibility during migration
export const createServerComponentFromStream = createCompositeFromStream
