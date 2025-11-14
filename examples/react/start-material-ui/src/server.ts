/**
 * TanStack Start server entry with Emotion SSR streaming fix.
 *
 * This server handler intercepts the SSR HTML stream and removes inline Emotion
 * style tags from React Suspense boundaries to prevent hydration mismatches.
 *
 * ## Why this is needed
 * Emotion + React 18+ streaming SSR + Suspense = hydration errors. Client-side Emotion
 * intercepts inline style tags in Suspense chunks and modifies their data-emotion attributes,
 * causing React to detect a mismatch between server HTML and client DOM.
 *
 * ## Solution
 * Use the framework-agnostic `createEmotionStyleFixerStream` utility to strip inline
 * style tags from Suspense chunks during streaming. See emotion-stream-utils.ts for details.
 *
 * ## Adapting to other frameworks
 * The core logic is in emotion-stream-utils.ts and can be used with any framework that
 * supports stream transformation. Only this integration code needs to change.
 *
 * @see emotion-stream-utils.ts - Framework-agnostic utility
 * @see ../EMOTION_STREAMING_SSR.md - Detailed explanation and framework examples
 */

import {
  createStartHandler,
  defaultStreamHandler,
  defineHandlerCallback,
} from '@tanstack/react-start/server'
import { EMOTION_CACHE_KEY } from './emotion-cache'
import {
  createEmotionStyleFixerStream,
  createEmotionStyleFixerStreamSimple,
} from './emotion-stream-utils'

const DEBUG = process.env.DEBUG === 'true'

/**
 * Custom TanStack Start handler that pipes the SSR stream through the Emotion style fixer.
 *
 * This wraps the default stream handler and applies the transformation before returning
 * the response to the client.
 */
const customEmotionStreamHandler = defineHandlerCallback(
  async ({ request, router, responseHeaders }) => {
    if (DEBUG) {
      console.log('[TanStack Start] Handler invoked for request:', request.url)
    }

    // Get the standard SSR stream from TanStack Start
    const response = await defaultStreamHandler({
      request,
      router,
      responseHeaders,
    })

    if (DEBUG) {
      console.log(
        '[TanStack Start] Got response from defaultStreamHandler, status:',
        response.status,
      )
    }

    // If no body (unlikely), return as-is
    if (!response.body) {
      console.warn('[TanStack Start] Response has no body, returning as-is')
      return response
    }

    try {
      // Create the Emotion style fixer transform stream
      const emotionFixer = DEBUG
        ? createEmotionStyleFixerStream({
            cacheKey: EMOTION_CACHE_KEY,
            debug: true,
          })
        : createEmotionStyleFixerStreamSimple({ cacheKey: EMOTION_CACHE_KEY })

      // Pipe the response body through the transformer
      const transformedStream = response.body.pipeThrough(emotionFixer)

      // Return the transformed stream with original status/headers
      return new Response(transformedStream, {
        status: response.status,
        headers: response.headers,
      })
    } catch (error) {
      console.error('[TanStack Start] Failed to transform stream:', error)
      // Fail gracefully: return original response
      return response
    }
  },
)

// Create the TanStack Start handler with our custom stream transformer
const fetch = createStartHandler(customEmotionStreamHandler)

export default {
  fetch,
}
