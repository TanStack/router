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
const SCRIPT_END_TAG = '</script>'

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
  // Check upfront if serialization already finished synchronously
  // This is the fast path for routes with no deferred data
  const serializationAlreadyFinished =
    router.serverSsr?.isSerializationFinished() ?? false

  // Take any HTML that was buffered before we started listening
  const initialBufferedHtml = router.serverSsr?.takeBufferedHtml()

  // True passthrough: if serialization already finished and nothing buffered,
  // we can avoid any decoding/scanning while still honoring cleanup + setRenderFinished.
  if (serializationAlreadyFinished && !initialBufferedHtml) {
    let cleanedUp = false
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined
    let isStreamClosed = false
    let lifetimeTimeoutHandle: ReturnType<typeof setTimeout> | undefined
    let appReader: ReadableStreamDefaultReader | undefined

    const cancelActiveReader = (reason?: unknown) => {
      const activeReader = appReader
      appReader = undefined
      void activeReader?.cancel(reason).catch(() => {
        // ignore
      })
    }

    const cleanup = () => {
      if (cleanedUp) return
      cleanedUp = true

      cancelActiveReader()

      if (lifetimeTimeoutHandle !== undefined) {
        clearTimeout(lifetimeTimeoutHandle)
        lifetimeTimeoutHandle = undefined
      }

      router.serverSsr?.cleanup()
    }

    const safeClose = () => {
      if (isStreamClosed) return
      isStreamClosed = true
      try {
        controller?.close()
      } catch {
        // ignore
      }
    }

    const safeError = (error: unknown) => {
      if (isStreamClosed) return
      isStreamClosed = true
      try {
        controller?.error(error)
      } catch {
        // ignore
      }
    }

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

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c
      },
      cancel(reason) {
        isStreamClosed = true
        cancelActiveReader(reason)
        cleanup()
      },
    })

    ;(async () => {
      const reader = appStream.getReader()
      appReader = reader
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (cleanedUp || isStreamClosed) return

          if (typeof value === 'string') {
            controller?.enqueue(textEncoder.encode(value))
          } else {
            controller?.enqueue(value as Uint8Array)
          }
        }

        if (cleanedUp || isStreamClosed) return

        router.serverSsr?.setRenderFinished()
        safeClose()
        cleanup()
      } catch (error) {
        if (cleanedUp) return
        console.error('Error reading appStream:', error)
        router.serverSsr?.setRenderFinished()
        safeError(error)
        cleanup()
      } finally {
        appReader = undefined
        reader.releaseLock()
      }
    })().catch((error) => {
      if (cleanedUp) return
      console.error('Error in stream transform:', error)
      safeError(error)
      cleanup()
    })

    return stream
  }

  let stopListeningToInjectedHtml: (() => void) | undefined
  let stopListeningToSerializationFinished: (() => void) | undefined
  let serializationTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  let lifetimeTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  let cleanedUp = false

  let controller: ReadableStreamDefaultController<Uint8Array>
  let isStreamClosed = false
  let appReader: ReadableStreamDefaultReader | undefined

  const cancelActiveReader = (reason?: unknown) => {
    const activeReader = appReader
    appReader = undefined
    void activeReader?.cancel(reason).catch(() => {
      // ignore
    })
  }

  const textDecoder = new TextDecoder()

  // concat'd router HTML; avoids array joins on each flush
  let pendingRouterHtml = initialBufferedHtml ?? ''

  // between-chunk text buffer; keep bounded to avoid unbounded memory
  let leftover = ''

  // captured closing tags and trailing tail from </body> onward
  let pendingClosingTags = ''

  // conservative cap: enough to hold any partial closing tag + a bit
  const MAX_LEFTOVER_CHARS = 2048

  let isAppRendering = true
  let streamBarrierLifted = false
  let serializationFinished = serializationAlreadyFinished

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
      // ignore
    }
  }

  function safeError(error: unknown) {
    if (isStreamClosed) return
    isStreamClosed = true
    try {
      controller.error(error)
    } catch {
      // ignore
    }
  }

  /**
   * Cleanup with guards; must be idempotent.
   */
  function cleanup() {
    if (cleanedUp) return
    cleanedUp = true

    cancelActiveReader()

    try {
      stopListeningToInjectedHtml?.()
      stopListeningToSerializationFinished?.()
    } catch {
      // ignore
    }
    stopListeningToInjectedHtml = undefined
    stopListeningToSerializationFinished = undefined

    if (serializationTimeoutHandle !== undefined) {
      clearTimeout(serializationTimeoutHandle)
      serializationTimeoutHandle = undefined
    }
    if (lifetimeTimeoutHandle !== undefined) {
      clearTimeout(lifetimeTimeoutHandle)
      lifetimeTimeoutHandle = undefined
    }

    pendingRouterHtml = ''
    leftover = ''
    pendingClosingTags = ''
    router.serverSsr?.cleanup()
  }

  const stream = new ReadableStream({
    start(c) {
      controller = c
    },
    cancel(reason) {
      isStreamClosed = true
      cancelActiveReader(reason)
      cleanup()
    },
  })

  function flushPendingRouterHtml({ force = false }: { force?: boolean } = {}) {
    if (!pendingRouterHtml) return
    if (!force && !streamBarrierLifted) return
    safeEnqueue(pendingRouterHtml)
    pendingRouterHtml = ''
  }

  function appendRouterHtml(html: string) {
    if (!html) return
    pendingRouterHtml += html
  }

  /**
   * Finish only when app done and serialization complete.
   */
  function tryFinish() {
    if (isAppRendering || !serializationFinished) return
    if (cleanedUp || isStreamClosed) return

    if (serializationTimeoutHandle !== undefined) {
      clearTimeout(serializationTimeoutHandle)
      serializationTimeoutHandle = undefined
    }

    // Flush any remaining bytes in the TextDecoder
    const decoderRemainder = textDecoder.decode()

    if (leftover) safeEnqueue(leftover)
    if (decoderRemainder) safeEnqueue(decoderRemainder)
    flushPendingRouterHtml({ force: true })
    if (pendingClosingTags) safeEnqueue(pendingClosingTags)
    safeClose()
    cleanup()
  }

  // Safety net: cleanup even if consumer never reads
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

  if (!serializationAlreadyFinished) {
    stopListeningToInjectedHtml = router.subscribe('onInjectedHtml', () => {
      if (cleanedUp || isStreamClosed) return
      const html = router.serverSsr?.takeBufferedHtml()
      if (!html) return

      if (!streamBarrierLifted || isAppRendering || leftover || pendingClosingTags) {
        appendRouterHtml(html)
      } else {
        safeEnqueue(html)
      }
    })

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
    appReader = reader
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (cleanedUp || isStreamClosed) return

        const text =
          typeof value === 'string'
            ? value
            : ArrayBuffer.isView(value)
              ? textDecoder.decode(value as Uint8Array, { stream: true })
              : String(value)

        // Fast path: most chunks have no pending left-over.
        const chunkString = leftover ? leftover + text : text

        const barrierFoundInChunk =
          !streamBarrierLifted && chunkString.includes(TSR_SCRIPT_BARRIER_ID)

        if (barrierFoundInChunk) {
          const barrierMarkerIndex = chunkString.indexOf(TSR_SCRIPT_BARRIER_ID)
          const barrierScriptClosedInChunk =
            barrierMarkerIndex !== -1 &&
            chunkString.indexOf(SCRIPT_END_TAG, barrierMarkerIndex) !== -1

          streamBarrierLifted = true
          router.serverSsr?.liftScriptBarrier()

          const barrierChunkBodyEndIndex = chunkString.indexOf(BODY_END_TAG)
          if (barrierChunkBodyEndIndex !== -1) {
            safeEnqueue(chunkString.slice(0, barrierChunkBodyEndIndex))
            pendingClosingTags = chunkString.slice(barrierChunkBodyEndIndex)
          } else {
            safeEnqueue(chunkString)
          }

          if (barrierScriptClosedInChunk) {
            flushPendingRouterHtml()
          }

          leftover = ''
          continue
        }

        if (pendingClosingTags) {
          pendingClosingTags += chunkString
          leftover = ''
          continue
        }

        const bodyEndIndex = chunkString.indexOf(BODY_END_TAG)

        if (bodyEndIndex !== -1) {
          safeEnqueue(chunkString.slice(0, bodyEndIndex))
          pendingClosingTags = chunkString.slice(bodyEndIndex)
          flushPendingRouterHtml()
          leftover = ''
          continue
        }

        const lastClosingTagEnd = findLastClosingTagEnd(chunkString)

        if (lastClosingTagEnd > 0) {
          safeEnqueue(chunkString.slice(0, lastClosingTagEnd))
          flushPendingRouterHtml()

          leftover = chunkString.slice(lastClosingTagEnd)
          if (leftover.length > MAX_LEFTOVER_CHARS) {
            // Ensure bounded memory even if a consumer streams long text sequences
            // without any closing tags. This may reduce injection granularity but is correct.
            safeEnqueue(leftover.slice(0, leftover.length - MAX_LEFTOVER_CHARS))
            leftover = leftover.slice(-MAX_LEFTOVER_CHARS)
          }
        } else {
          // No closing tag found; keep small tail to handle split closing tags,
          // but stream older bytes to prevent unbounded buffering.
          const combined = chunkString
          if (combined.length > MAX_LEFTOVER_CHARS) {
            const flushUpto = combined.length - MAX_LEFTOVER_CHARS
            safeEnqueue(combined.slice(0, flushUpto))
            leftover = combined.slice(flushUpto)
          } else {
            leftover = combined
          }
        }
      }

      if (cleanedUp || isStreamClosed) return

      isAppRendering = false
      router.serverSsr?.setRenderFinished()

      if (serializationFinished) {
        tryFinish()
      } else {
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
      appReader = undefined
      reader.releaseLock()
    }
  })().catch((error) => {
    if (cleanedUp) return
    console.error('Error in stream transform:', error)
    safeError(error)
    cleanup()
  })

  return stream
}
