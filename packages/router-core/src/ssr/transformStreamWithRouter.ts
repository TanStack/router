import { ReadableStream } from 'node:stream/web'
import { Readable } from 'node:stream'
import { TSR_SCRIPT_BARRIER_ID } from './constants'
import type { AnyRouter } from '../router'

export function transformReadableStreamWithRouter(
  router: AnyRouter,
  routerStream: ReadableStream,
) {
  return transformStreamWithRouter(router, routerStream)
}

export function transformPipeableStreamWithRouter(
  router: AnyRouter,
  routerStream: Readable,
) {
  return Readable.fromWeb(
    transformStreamWithRouter(router, Readable.toWeb(routerStream)),
  )
}

// Use string constants for simple indexOf matching
const BODY_END_TAG = '</body>'
const HTML_END_TAG = '</html>'

// Minimum length of a valid closing tag: </a> = 4 characters
const MIN_CLOSING_TAG_LENGTH = 4

// Default timeout values (in milliseconds)
const DEFAULT_SERIALIZATION_TIMEOUT_MS = 60000
const DEFAULT_LIFETIME_TIMEOUT_MS = 60000

// Module-level encoder (stateless, safe to reuse)
const textEncoder = new TextEncoder()

/**
 * Finds the position just after the last valid HTML closing tag in the string.
 *
 * Valid closing tags match the pattern: </[a-zA-Z][\w:.-]*>
 * Examples: </div>, </my-component>, </slot:name.nested>
 *
 * @returns Position after the last closing tag, or -1 if none found
 */
function findLastClosingTagEnd(str: string): number {
  const len = str.length
  if (len < MIN_CLOSING_TAG_LENGTH) return -1

  let i = len - 1

  while (i >= MIN_CLOSING_TAG_LENGTH - 1) {
    // Look for > (charCode 62)
    if (str.charCodeAt(i) === 62) {
      // Look backwards for valid tag name characters
      let j = i - 1

      // Skip through valid tag name characters
      while (j >= 1) {
        const code = str.charCodeAt(j)
        // Check if it's a valid tag name char: [a-zA-Z0-9_:.-]
        if (
          (code >= 97 && code <= 122) || // a-z
          (code >= 65 && code <= 90) || // A-Z
          (code >= 48 && code <= 57) || // 0-9
          code === 95 || // _
          code === 58 || // :
          code === 46 || // .
          code === 45 // -
        ) {
          j--
        } else {
          break
        }
      }

      // Check if the first char after </ is a valid start char (letter only)
      const tagNameStart = j + 1
      if (tagNameStart < i) {
        const startCode = str.charCodeAt(tagNameStart)
        // Tag name must start with a letter (a-z or A-Z)
        if (
          (startCode >= 97 && startCode <= 122) ||
          (startCode >= 65 && startCode <= 90)
        ) {
          // Check for </ (charCodes: < = 60, / = 47)
          if (
            j >= 1 &&
            str.charCodeAt(j) === 47 &&
            str.charCodeAt(j - 1) === 60
          ) {
            return i + 1 // Return position after the closing >
          }
        }
      }
    }
    i--
  }
  return -1
}

export function transformStreamWithRouter(
  router: AnyRouter,
  appStream: ReadableStream,
  opts?: {
    /** Timeout for serialization to complete after app render finishes (default: 60000ms) */
    timeoutMs?: number
    /** Maximum lifetime of the stream transform (default: 60000ms). Safety net for cleanup. */
    lifetimeMs?: number
  },
) {
  let stopListeningToInjectedHtml: (() => void) | undefined
  let stopListeningToSerializationFinished: (() => void) | undefined
  let serializationTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  let lifetimeTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  let cleanedUp = false

  let controller: ReadableStreamDefaultController<any>
  let isStreamClosed = false

  // Check upfront if serialization already finished synchronously
  // This is the fast path for routes with no deferred data
  const serializationAlreadyFinished =
    router.serverSsr?.isSerializationFinished() ?? false

  /**
   * Cleanup function with guards against multiple calls.
   * Unsubscribes listeners, clears timeouts, frees buffers, and cleans up router SSR state.
   */
  function cleanup() {
    // Guard against multiple cleanup calls - set flag first to prevent re-entry
    if (cleanedUp) return
    cleanedUp = true

    // Unsubscribe listeners first (wrap in try-catch for safety)
    try {
      stopListeningToInjectedHtml?.()
      stopListeningToSerializationFinished?.()
    } catch (e) {
      // Ignore errors during unsubscription
    }
    stopListeningToInjectedHtml = undefined
    stopListeningToSerializationFinished = undefined

    // Clear all timeouts
    if (serializationTimeoutHandle !== undefined) {
      clearTimeout(serializationTimeoutHandle)
      serializationTimeoutHandle = undefined
    }
    if (lifetimeTimeoutHandle !== undefined) {
      clearTimeout(lifetimeTimeoutHandle)
      lifetimeTimeoutHandle = undefined
    }

    // Clear buffers to free memory
    pendingRouterHtmlParts = []
    leftover = ''
    pendingClosingTags = ''

    // Clean up router SSR state (has its own guard)
    router.serverSsr?.cleanup()
  }

  const textDecoder = new TextDecoder()

  function safeEnqueue(chunk: string | Uint8Array) {
    if (isStreamClosed) return
    if (typeof chunk === 'string') {
      controller.enqueue(textEncoder.encode(chunk))
    } else {
      controller.enqueue(chunk)
    }
  }

  function safeClose() {
    if (isStreamClosed) return
    isStreamClosed = true
    try {
      controller.close()
    } catch {
      // Stream may already be errored or closed by consumer - safe to ignore
    }
  }

  function safeError(error: unknown) {
    if (isStreamClosed) return
    isStreamClosed = true
    try {
      controller.error(error)
    } catch {
      // Stream may already be errored or closed by consumer - safe to ignore
    }
  }

  const stream = new ReadableStream({
    start(c) {
      controller = c
    },
    cancel() {
      isStreamClosed = true
      cleanup()
    },
  })

  let isAppRendering = true
  let streamBarrierLifted = false
  let leftover = ''
  let pendingClosingTags = ''
  let serializationFinished = serializationAlreadyFinished

  let pendingRouterHtmlParts: Array<string> = []

  // Take any HTML that was buffered before we started listening
  const bufferedHtml = router.serverSsr?.takeBufferedHtml()
  if (bufferedHtml) {
    pendingRouterHtmlParts.push(bufferedHtml)
  }

  function flushPendingRouterHtml() {
    if (pendingRouterHtmlParts.length > 0) {
      safeEnqueue(pendingRouterHtmlParts.join(''))
      pendingRouterHtmlParts = []
    }
  }

  /**
   * Attempts to finish the stream if all conditions are met.
   */
  function tryFinish() {
    // Can only finish when app is done rendering and serialization is complete
    if (isAppRendering || !serializationFinished) return
    if (cleanedUp || isStreamClosed) return

    // Clear serialization timeout since we're finishing
    if (serializationTimeoutHandle !== undefined) {
      clearTimeout(serializationTimeoutHandle)
      serializationTimeoutHandle = undefined
    }

    // Flush any remaining bytes in the TextDecoder
    const decoderRemainder = textDecoder.decode()

    if (leftover) safeEnqueue(leftover)
    if (decoderRemainder) safeEnqueue(decoderRemainder)
    flushPendingRouterHtml()
    if (pendingClosingTags) safeEnqueue(pendingClosingTags)

    safeClose()
    cleanup()
  }

  // Set up lifetime timeout as a safety net
  // This ensures cleanup happens even if the stream is never consumed or gets stuck
  const lifetimeMs = opts?.lifetimeMs ?? DEFAULT_LIFETIME_TIMEOUT_MS
  lifetimeTimeoutHandle = setTimeout(() => {
    if (!cleanedUp && !isStreamClosed) {
      console.warn(
        `SSR stream transform exceeded maximum lifetime (${lifetimeMs}ms), forcing cleanup`,
      )
      safeError(new Error('Stream lifetime exceeded'))
      cleanup()
    }
  }, lifetimeMs)

  // Only set up listeners if serialization hasn't already finished
  // This avoids unnecessary subscriptions for the common case of no deferred data
  if (!serializationAlreadyFinished) {
    // Listen for injected HTML (for deferred data that resolves later)
    stopListeningToInjectedHtml = router.subscribe('onInjectedHtml', () => {
      if (cleanedUp || isStreamClosed) return

      // Retrieve buffered HTML
      const html = router.serverSsr?.takeBufferedHtml()
      if (!html) return

      if (isAppRendering) {
        // Buffer for insertion at next valid position
        pendingRouterHtmlParts.push(html)
      } else {
        // App is done rendering, write directly to output
        safeEnqueue(html)
      }
    })

    // Listen for serialization finished
    stopListeningToSerializationFinished = router.subscribe(
      'onSerializationFinished',
      () => {
        serializationFinished = true
        tryFinish()
      },
    )
  }

  // Transform the appStream
  ;(async () => {
    const reader = appStream.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Don't process if already cleaned up
        if (cleanedUp || isStreamClosed) return

        const text =
          value instanceof Uint8Array
            ? textDecoder.decode(value, { stream: true })
            : String(value)
        const chunkString = leftover + text

        // Check for stream barrier (script placeholder) - use indexOf for efficiency
        if (!streamBarrierLifted) {
          if (chunkString.includes(TSR_SCRIPT_BARRIER_ID)) {
            streamBarrierLifted = true
            router.serverSsr?.liftScriptBarrier()
          }
        }

        // Check for body/html end tags
        const bodyEndIndex = chunkString.indexOf(BODY_END_TAG)
        const htmlEndIndex = chunkString.indexOf(HTML_END_TAG)

        // If we have both </body> and </html> in proper order,
        // insert router HTML before </body> and hold the closing tags
        if (
          bodyEndIndex !== -1 &&
          htmlEndIndex !== -1 &&
          bodyEndIndex < htmlEndIndex
        ) {
          pendingClosingTags = chunkString.slice(bodyEndIndex)

          safeEnqueue(chunkString.slice(0, bodyEndIndex))
          flushPendingRouterHtml()

          leftover = ''
          continue
        }

        // Handling partial closing tags split across chunks:
        //
        // Since `chunkString = leftover + text`, any incomplete tag fragment from the
        // previous chunk is prepended to the current chunk, allowing split tags like
        // "</di" + "v>" to be re-detected as a complete "</div>" in the combined string.
        //
        // - If a closing tag IS found (lastClosingTagEnd > 0): We enqueue content up to
        //   the end of that tag, flush router HTML, and store the remainder in `leftover`.
        //   This remainder may contain a partial tag (e.g., "</sp") which will be
        //   prepended to the next chunk for re-detection.
        //
        // - If NO closing tag is found: The entire chunk is buffered in `leftover` and
        //   will be prepended to the next chunk. This ensures partial tags are never
        //   lost and will be detected once the rest of the tag arrives.
        //
        // This approach guarantees correct injection points even when closing tags span
        // chunk boundaries.
        const lastClosingTagEnd = findLastClosingTagEnd(chunkString)

        if (lastClosingTagEnd > 0) {
          // Found a closing tag - insert router HTML after it
          safeEnqueue(chunkString.slice(0, lastClosingTagEnd))
          flushPendingRouterHtml()

          leftover = chunkString.slice(lastClosingTagEnd)
        } else {
          // No closing tag found - buffer the entire chunk
          leftover = chunkString
          // Any pending router HTML will be inserted when we find a valid position
        }
      }

      // Stream ended
      if (cleanedUp || isStreamClosed) return

      // Mark the app as done rendering
      isAppRendering = false
      router.serverSsr?.setRenderFinished()

      // Try to finish if serialization is already done
      if (serializationFinished) {
        tryFinish()
      } else {
        // Set a timeout for serialization to complete
        const timeoutMs = opts?.timeoutMs ?? DEFAULT_SERIALIZATION_TIMEOUT_MS
        serializationTimeoutHandle = setTimeout(() => {
          if (!cleanedUp && !isStreamClosed) {
            console.error('Serialization timeout after app render finished')
            safeError(
              new Error('Serialization timeout after app render finished'),
            )
            cleanup()
          }
        }, timeoutMs)
      }
    } catch (error) {
      if (cleanedUp) return
      console.error('Error reading appStream:', error)
      isAppRendering = false
      router.serverSsr?.setRenderFinished()
      safeError(error)
      cleanup()
    } finally {
      reader.releaseLock()
    }
  })().catch((error) => {
    // Handle any errors that occur outside the try block (e.g., getReader() failure)
    if (cleanedUp) return
    console.error('Error in stream transform:', error)
    safeError(error)
    cleanup()
  })

  return stream
}
