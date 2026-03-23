import { ReadableStream } from 'node:stream/web'
import { Readable } from 'node:stream'
import { isAscii } from 'node:buffer'
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

type StreamPhase = 'streaming' | 'appDone' | 'finished'
type BarrierPhase = 'locked' | 'lifted'
type TailPhase = 'normal' | 'afterBody'

type StreamLifecycle = {
  stream: ReadableStream<Uint8Array>
  setReader: (reader: ReadableStreamDefaultReader | undefined) => void
  isClosed: () => boolean
  isCleanedUp: () => boolean
  safeEnqueue: (chunk: string | Uint8Array) => void
  safeClose: () => void
  safeError: (error: unknown) => void
  cleanup: () => void
}

function createStreamLifecycle(opts: {
  router: AnyRouter
  lifetimeMs: number
  withLifetimeTimeout?: boolean
  onCleanup?: () => void
}): StreamLifecycle {
  const withLifetimeTimeout = opts.withLifetimeTimeout ?? true
  let cleanedUp = false
  let isStreamClosed = false
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let appReader: ReadableStreamDefaultReader | undefined
  let lifetimeTimeoutHandle: ReturnType<typeof setTimeout> | undefined

  const cancelActiveReader = (reason?: unknown) => {
    const activeReader = appReader
    appReader = undefined
    void activeReader?.cancel(reason).catch(() => {
      // ignore
    })
  }

  const safeEnqueue = (chunk: string | Uint8Array) => {
    if (isStreamClosed) return
    if (typeof chunk === 'string') {
      controller?.enqueue(Buffer.from(chunk, 'utf8'))
    } else {
      controller?.enqueue(chunk)
    }
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

  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true

    cancelActiveReader()

    if (lifetimeTimeoutHandle !== undefined) {
      clearTimeout(lifetimeTimeoutHandle)
      lifetimeTimeoutHandle = undefined
    }

    try {
      opts.onCleanup?.()
    } catch {
      // ignore
    }

    opts.router.serverSsr?.cleanup()
  }

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

  if (withLifetimeTimeout) {
    lifetimeTimeoutHandle = setTimeout(() => {
      if (!cleanedUp && !isStreamClosed) {
        console.warn(
          `SSR stream transform exceeded maximum lifetime (${opts.lifetimeMs}ms), forcing cleanup`,
        )
        safeError(new Error('Stream lifetime exceeded'))
        cleanup()
      }
    }, opts.lifetimeMs)
  }

  return {
    stream,
    setReader: (reader) => {
      appReader = reader
    },
    isClosed: () => isStreamClosed,
    isCleanedUp: () => cleanedUp,
    safeEnqueue,
    safeClose,
    safeError,
    cleanup,
  }
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

  const lifetimeMs = opts?.lifetimeMs ?? DEFAULT_LIFETIME_TIMEOUT_MS

  // True passthrough: if serialization already finished and nothing buffered,
  // we can avoid any decoding/scanning while still honoring cleanup + setRenderFinished.
  if (serializationAlreadyFinished && !initialBufferedHtml) {
    const lifecycle = createStreamLifecycle({
      router,
      lifetimeMs,
      withLifetimeTimeout: true,
    })

    ;(async () => {
      const reader = appStream.getReader()
      lifecycle.setReader(reader)
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (lifecycle.isCleanedUp() || lifecycle.isClosed()) return

          if (typeof value === 'string') {
            lifecycle.safeEnqueue(value)
          } else {
            lifecycle.safeEnqueue(value as Uint8Array)
          }
        }

        if (lifecycle.isCleanedUp() || lifecycle.isClosed()) return

        router.serverSsr?.setRenderFinished()
        lifecycle.safeClose()
        lifecycle.cleanup()
      } catch (error) {
        if (lifecycle.isCleanedUp()) return
        console.error('Error reading appStream:', error)
        router.serverSsr?.setRenderFinished()
        lifecycle.safeError(error)
        lifecycle.cleanup()
      } finally {
        lifecycle.setReader(undefined)
      }
    })().catch((error) => {
      if (lifecycle.isCleanedUp()) return
      console.error('Error in stream transform:', error)
      lifecycle.safeError(error)
      lifecycle.cleanup()
    })

    return lifecycle.stream
  }

  type TransformState = {
    streamPhase: StreamPhase
    barrierPhase: BarrierPhase
    tailPhase: TailPhase
    serializationDone: boolean
  }

  const state: TransformState = {
    streamPhase: 'streaming',
    barrierPhase: 'locked',
    tailPhase: 'normal',
    serializationDone: serializationAlreadyFinished,
  }

  let stopListeningToInjectedHtml: (() => void) | undefined
  let stopListeningToSerializationFinished: (() => void) | undefined
  let serializationTimeoutHandle: ReturnType<typeof setTimeout> | undefined

  const textDecoder = new TextDecoder()
  let usedBinaryDecoder = false

  // concat'd router HTML; avoids array joins on each flush
  let pendingRouterHtml = initialBufferedHtml ?? ''

  // between-chunk text buffer; keep bounded to avoid unbounded memory
  let leftover = ''

  // captured closing tags and trailing tail from </body> onward
  let pendingClosingTags = ''

  // conservative cap: enough to hold any partial closing tag + a bit
  const MAX_LEFTOVER_CHARS = 2048

  const lifecycle = createStreamLifecycle({
    router,
    lifetimeMs,
    withLifetimeTimeout: true,
    onCleanup: () => {
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

      pendingRouterHtml = ''
      leftover = ''
      pendingClosingTags = ''
    },
  })

  function flushPendingRouterHtml(force = false) {
    if (!pendingRouterHtml) return
    if (!force && state.barrierPhase === 'locked') return
    lifecycle.safeEnqueue(pendingRouterHtml)
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
    if (state.streamPhase === 'streaming' || !state.serializationDone) return
    if (lifecycle.isCleanedUp() || lifecycle.isClosed()) return

    if (serializationTimeoutHandle !== undefined) {
      clearTimeout(serializationTimeoutHandle)
      serializationTimeoutHandle = undefined
    }

    // Flush any remaining bytes in the TextDecoder
    const decoderRemainder = usedBinaryDecoder ? textDecoder.decode() : ''

    if (leftover) lifecycle.safeEnqueue(leftover)
    if (decoderRemainder) lifecycle.safeEnqueue(decoderRemainder)
    flushPendingRouterHtml(true)
    if (pendingClosingTags) lifecycle.safeEnqueue(pendingClosingTags)
    state.streamPhase = 'finished'
    lifecycle.safeClose()
    lifecycle.cleanup()
  }

  if (!serializationAlreadyFinished) {
    stopListeningToInjectedHtml = router.subscribe('onInjectedHtml', () => {
      if (lifecycle.isCleanedUp() || lifecycle.isClosed()) return
      const html = router.serverSsr?.takeBufferedHtml()
      if (!html) return

      if (
        state.barrierPhase === 'locked' ||
        state.streamPhase === 'streaming' ||
        leftover ||
        state.tailPhase === 'afterBody'
      ) {
        appendRouterHtml(html)
      } else {
        lifecycle.safeEnqueue(html)
      }
    })

    stopListeningToSerializationFinished = router.subscribe(
      'onSerializationFinished',
      () => {
        state.serializationDone = true
        tryFinish()
      },
    )
  }

  // Transform the appStream
  ;(async () => {
    const reader = appStream.getReader()
    lifecycle.setReader(reader)
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (lifecycle.isCleanedUp() || lifecycle.isClosed()) return

        const rawUint8Chunk = value instanceof Uint8Array ? value : undefined

        if (
          rawUint8Chunk &&
          !leftover &&
          !pendingRouterHtml &&
          state.tailPhase === 'normal' &&
          state.barrierPhase === 'lifted'
        ) {
          if (rawUint8Chunk.indexOf(60) === -1) {
            lifecycle.safeEnqueue(rawUint8Chunk)
            continue
          }
        }

        let text: string
        if (typeof value === 'string') {
          text = value
        } else if (ArrayBuffer.isView(value)) {
          const view = value as Uint8Array
          if (!isAscii(view)) {
            usedBinaryDecoder = true
            text = textDecoder.decode(view, { stream: true })
          } else {
            text = Buffer.from(
              view.buffer,
              view.byteOffset,
              view.byteLength,
            ).toString('utf8')
          }
        } else {
          text = String(value)
        }

        // Fast path: most chunks have no pending left-over.
        const chunkString = leftover ? leftover + text : text

        const barrierMarkerIndex =
          state.barrierPhase === 'locked'
            ? chunkString.indexOf(TSR_SCRIPT_BARRIER_ID)
            : -1

        if (barrierMarkerIndex !== -1) {
          const barrierScriptClosedInChunk =
            chunkString.indexOf(SCRIPT_END_TAG, barrierMarkerIndex) !== -1

          state.barrierPhase = 'lifted'
          router.serverSsr?.liftScriptBarrier()

          const barrierChunkBodyEndIndex = chunkString.indexOf(BODY_END_TAG)
          if (barrierChunkBodyEndIndex !== -1) {
            lifecycle.safeEnqueue(
              chunkString.slice(0, barrierChunkBodyEndIndex),
            )
            pendingClosingTags = chunkString.slice(barrierChunkBodyEndIndex)
            state.tailPhase = 'afterBody'
          } else {
            lifecycle.safeEnqueue(chunkString)
          }

          if (barrierScriptClosedInChunk) {
            flushPendingRouterHtml()
          }

          leftover = ''
          continue
        }

        if (state.tailPhase === 'afterBody') {
          pendingClosingTags += chunkString
          leftover = ''
          continue
        }

        const bodyEndIndex = chunkString.indexOf(BODY_END_TAG)

        if (bodyEndIndex !== -1) {
          lifecycle.safeEnqueue(chunkString.slice(0, bodyEndIndex))
          pendingClosingTags = chunkString.slice(bodyEndIndex)
          state.tailPhase = 'afterBody'
          flushPendingRouterHtml()
          leftover = ''
          continue
        }

        // Fast non-mutating passthrough in normal path: no pending injected HTML,
        // no buffered carry-over, and no structural rewrite needed for this chunk.
        if (!pendingRouterHtml && !leftover) {
          if (rawUint8Chunk) {
            lifecycle.safeEnqueue(rawUint8Chunk)
          } else {
            lifecycle.safeEnqueue(chunkString)
          }
          continue
        }

        const lastClosingTagEnd = findLastClosingTagEnd(chunkString)

        if (lastClosingTagEnd > 0) {
          lifecycle.safeEnqueue(chunkString.slice(0, lastClosingTagEnd))
          flushPendingRouterHtml()

          leftover = chunkString.slice(lastClosingTagEnd)
          if (leftover.length > MAX_LEFTOVER_CHARS) {
            // Ensure bounded memory even if a consumer streams long text sequences
            // without any closing tags. This may reduce injection granularity but is correct.
            lifecycle.safeEnqueue(
              leftover.slice(0, leftover.length - MAX_LEFTOVER_CHARS),
            )
            leftover = leftover.slice(-MAX_LEFTOVER_CHARS)
          }
        } else {
          // No closing tag found; keep small tail to handle split closing tags,
          // but stream older bytes to prevent unbounded buffering.
          const combined = chunkString
          if (combined.length > MAX_LEFTOVER_CHARS) {
            const flushUpto = combined.length - MAX_LEFTOVER_CHARS
            lifecycle.safeEnqueue(combined.slice(0, flushUpto))
            leftover = combined.slice(flushUpto)
          } else {
            leftover = combined
          }
        }
      }

      if (lifecycle.isCleanedUp() || lifecycle.isClosed()) return

      state.streamPhase = 'appDone'
      router.serverSsr?.setRenderFinished()

      if (state.serializationDone) {
        tryFinish()
      } else {
        const timeoutMs = opts?.timeoutMs ?? DEFAULT_SERIALIZATION_TIMEOUT_MS
        serializationTimeoutHandle = setTimeout(() => {
          if (!lifecycle.isCleanedUp() && !lifecycle.isClosed()) {
            console.error('Serialization timeout after app render finished')
            lifecycle.safeError(
              new Error('Serialization timeout after app render finished'),
            )
            lifecycle.cleanup()
          }
        }, timeoutMs)
      }
    } catch (error) {
      if (lifecycle.isCleanedUp()) return
      console.error('Error reading appStream:', error)
      state.streamPhase = 'appDone'
      router.serverSsr?.setRenderFinished()
      lifecycle.safeError(error)
      lifecycle.cleanup()
    } finally {
      lifecycle.setReader(undefined)
    }
  })().catch((error) => {
    if (lifecycle.isCleanedUp()) return
    console.error('Error in stream transform:', error)
    lifecycle.safeError(error)
    lifecycle.cleanup()
  })

  return lifecycle.stream
}
