/**
 * Utility for fixing Emotion SSR streaming hydration issues with React 18+ Suspense.
 *
 * Problem: Emotion renders inline style tags in Suspense boundaries. When React hydrates,
 * client-side Emotion modifies these tags' data-emotion attributes, causing hydration mismatches.
 *
 * Solution: Remove inline style tags from Suspense chunks during server streaming.
 * Styles remain available via <head> or Emotion's client cache.
 */

/**
 * Default Emotion cache key for Material-UI.
 */
export const EMOTION_CACHE_KEY = 'mui'

/**
 * Configuration options for the Emotion style fixer stream.
 */
export interface EmotionStyleFixerOptions {
  /**
   * The Emotion cache key to target (e.g., "mui", "chakra", "css").
   * Must match the key used in your Emotion cache configuration.
   */
  cacheKey: string

  /**
   * React Suspense boundary marker pattern.
   * @default '<div hidden id="S:'
   */
  suspenseBoundaryMarker?: string
}

/**
 * Creates a TransformStream that removes inline Emotion style tags from React Suspense
 * boundary chunks during SSR streaming.
 *
 * Includes optional debug logging to track chunk processing and style tag removal.
 *
 * @param options - Configuration options
 * @returns TransformStream for use with .pipeThrough()
 *
 * @example
 * ```typescript
 * const emotionFixer = createEmotionStyleFixerStream({
 *   cacheKey: 'mui',
 *   debug: true
 * })
 * const transformed = response.body.pipeThrough(emotionFixer)
 * ```
 */
export function createEmotionStyleFixerStream(
  options: EmotionStyleFixerOptions & { debug?: boolean },
): TransformStream<Uint8Array, Uint8Array> {
  const {
    cacheKey,
    debug = false,
    suspenseBoundaryMarker = '<div hidden id="S:',
  } = options

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let chunkCount = 0
  let totalStyleTagsRemoved = 0

  if (debug) {
    console.log(
      `[EmotionStyleFixer] Initializing - will remove inline style tags with key: ${cacheKey}`,
    )
  }

  const inlineStyleRegex = new RegExp(
    `<style data-emotion="${cacheKey}[^"]*">.*?</style>`,
    'g',
  )

  return new TransformStream<Uint8Array, Uint8Array>({
    start(_controller) {
      if (debug) {
        console.log('[EmotionStyleFixer] Stream started')
      }
    },

    transform(chunk, controller) {
      try {
        chunkCount++
        let html = decoder.decode(chunk, { stream: true })

        if (debug) {
          console.log(
            `[EmotionStyleFixer] Processing chunk ${chunkCount}, size: ${html.length} chars`,
          )
        }

        const isSuspenseChunk = html.includes(suspenseBoundaryMarker)

        if (isSuspenseChunk) {
          if (debug) {
            console.log(
              `[EmotionStyleFixer] Detected Suspense boundary in chunk ${chunkCount}`,
            )
          }

          const styleTagMatches = html.match(inlineStyleRegex)
          if (styleTagMatches) {
            totalStyleTagsRemoved += styleTagMatches.length

            if (debug) {
              console.log(
                `[EmotionStyleFixer] Found ${styleTagMatches.length} inline style tag(s) - removing:`,
                styleTagMatches.map((tag) => {
                  const preview = tag.substring(0, 80)
                  return tag.length > 80 ? `${preview}...` : preview
                }),
              )
            }

            html = html.replace(inlineStyleRegex, '')

            if (debug) {
              console.log(
                `[EmotionStyleFixer] ✓ Removed ${styleTagMatches.length} style tag(s) from chunk ${chunkCount}`,
              )
            }
          } else if (debug) {
            console.log(
              `[EmotionStyleFixer] No inline style tags found in Suspense chunk ${chunkCount}`,
            )
          }
        } else if (debug) {
          console.log(
            `[EmotionStyleFixer] Skipping non-Suspense chunk ${chunkCount}`,
          )
        }

        controller.enqueue(encoder.encode(html))
      } catch (error) {
        console.error('[EmotionStyleFixer] Error processing chunk:', error)
        controller.enqueue(chunk)
      }
    },

    flush(_controller) {
      if (debug) {
        console.log(
          `[EmotionStyleFixer] Stream ended. Processed ${chunkCount} chunks, removed ${totalStyleTagsRemoved} style tags total.`,
        )
      }
    },
  })
}

/**
 * Creates a TransformStream that removes inline Emotion style tags from Suspense chunks.
 *
 * @param options - Configuration options
 * @returns TransformStream for use with .pipeThrough()
 *
 * @example
 * ```typescript
 * const emotionFixer = createEmotionStyleFixerStreamSimple({ cacheKey: 'mui' })
 * const transformed = response.body.pipeThrough(emotionFixer)
 * ```
 */
export function createEmotionStyleFixerStreamSimple(
  options: EmotionStyleFixerOptions,
): TransformStream<Uint8Array, Uint8Array> {
  const { cacheKey, suspenseBoundaryMarker = '<div hidden id="S:' } = options

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const inlineStyleRegex = new RegExp(
    `<style data-emotion="${cacheKey}[^"]*">.*?</style>`,
    'g',
  )

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      try {
        let html = decoder.decode(chunk, { stream: true })

        if (html.includes(suspenseBoundaryMarker)) {
          html = html.replace(inlineStyleRegex, '')
        }

        controller.enqueue(encoder.encode(html))
      } catch (error) {
        console.error('[EmotionStyleFixer] Error processing chunk:', error)
        controller.enqueue(chunk)
      }
    },
  })
}
