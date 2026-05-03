'use client'

import { use } from 'react'
import { trackPostProcessPromise } from '@tanstack/start-client-core'
import { createFromReadableStream as browserDecode } from 'virtual:tanstack-rsc-browser-decode'

import { awaitLazyElements } from './awaitLazyElements'
import { createRscProxy } from './createRscProxy'
import { unwrapRscCssEnvelope } from './rscCssEnvelope'
import type {
  AnyCompositeComponent,
  RscSlotUsageEvent,
  ServerComponentStream,
} from './ServerComponentTypes'

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
): any {
  const { getTree, streamWrapper, cssHrefs } = setupStreamDecode(stream)

  return createRscProxy(getTree, {
    stream: streamWrapper,
    cssHrefs,
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
  },
): AnyCompositeComponent {
  const { getTree, streamWrapper, cssHrefs } = setupStreamDecode(stream)

  return createRscProxy(getTree, {
    stream: streamWrapper,
    cssHrefs,
    renderable: false,
    slotUsagesStream: options?.slotUsagesStream,
  })
}

/**
 * Shared stream decode setup for both renderable and composite.
 */
function setupStreamDecode(stream: ReadableStream<Uint8Array>): {
  getTree: () => unknown
  streamWrapper: ServerComponentStream
  cssHrefs: Set<string> | undefined
} {
  // Start decoding eagerly during deserialization
  const decodeThenable = browserDecode(stream)
  const cssHrefs = new Set<string>()

  // Synchronous cache for the decoded tree.
  let cachedTree: unknown = undefined
  let cacheReady = false

  // Promise for the tree with lazy elements awaited.
  const transformedTreePromise = Promise.resolve(decodeThenable).then(
    async (result) => {
      await awaitLazyElements(result, (href) => {
        cssHrefs.add(href)
      })
      cachedTree = unwrapRscCssEnvelope(result)
      cacheReady = true
      return cachedTree
    },
  )

  // Track the lazy element loading - prevents flash
  trackPostProcessPromise(transformedTreePromise)

  const streamWrapper: ServerComponentStream = {
    createReplayStream: () => stream,
  }

  const getTree = () => {
    if (cacheReady) return cachedTree
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return use(transformedTreePromise)
  }

  return { getTree, streamWrapper, cssHrefs }
}
// Legacy export for backwards compatibility during migration
export const createServerComponentFromStream = createCompositeFromStream
