import { ReadableStream } from 'node:stream/web'
import { Readable } from 'node:stream'
import { TSR_SCRIPT_BARRIER_ID } from './constants'
import type { AnyRouter } from '../router'

export type TransformStreamWithRouterOptions = {
  /** The request lifetime that owns this response stream. */
  signal?: AbortSignal
  /** Timeout for serialization to complete after app render finishes (default: 60000ms) */
  timeoutMs?: number
  /** Maximum lifetime of the stream transform (default: 120000ms). Safety net for cleanup. */
  lifetimeMs?: number
  /**
   * Called exactly once when the stream is torn down due to abort/error/
   * cancel/timeout — NOT on natural successful completion. Use this to
   * abort a hidden producer upstream of any PassThrough you passed in
   * (e.g. React `renderToPipeableStream`'s `abort()`).
   * Errors thrown from this callback are swallowed.
   */
  onAbort?: (reason?: unknown) => void
}

export function transformReadableStreamWithRouter(
  router: AnyRouter,
  routerStream: ReadableStream,
  opts?: TransformStreamWithRouterOptions,
) {
  return transformStreamWithRouter(router, routerStream, opts)
}

export function transformPipeableStreamWithRouter(
  router: AnyRouter,
  routerStream: Readable,
  opts?: TransformStreamWithRouterOptions,
) {
  return Readable.fromWeb(
    transformStreamWithRouter(router, Readable.toWeb(routerStream), opts),
  )
}

// Minimum length of a valid closing tag: </a> = 4 characters
const MIN_CLOSING_TAG_LENGTH = 4

// Default timeout values (in milliseconds)
const DEFAULT_SERIALIZATION_TIMEOUT_MS = 60000
const DEFAULT_LIFETIME_TIMEOUT_MS = DEFAULT_SERIALIZATION_TIMEOUT_MS * 2
const MAX_LEFTOVER_CHARS = 2048
const MAX_TAIL_CHARS = 64 * 1024
const MAX_ROUTER_HTML_CHARS = 16 * 1024 * 1024
const MAX_PENDING_WRITE_CHARS = 16 * 1024 * 1024

// Merge lifecycle: body bytes can stream, router HTML must precede tail,
// terminal states own close/error/cleanup exactly once.
const MergeState = {
  ReadingBody: 0,
  HoldingTail: 1,
  AppDone: 2,
  Draining: 3,
  Done: 4,
} as const

type MergeState = (typeof MergeState)[keyof typeof MergeState]

// Module-level encoder (stateless, safe to reuse)
const textEncoder = new TextEncoder()

// ASCII bytes of the barrier marker; safe to search for in raw UTF-8 because
// multi-byte sequences never contain ASCII (< 0x80) continuation bytes.
const BARRIER_MARKER_BYTES = textEncoder.encode(TSR_SCRIPT_BARRIER_ID)

const noop = () => {}
const resolvedPromise = Promise.resolve()

// Byte-level port of findHtmlBoundary operating directly on UTF-8 bytes.
// Closing tags are pure ASCII, and no multi-byte UTF-8 sequence contains a
// byte < 0x80, so scanning/slicing at byte positions can never corrupt text.
// Returns -bodyEndIndex - 2 when </body> is found; otherwise returns
// the position after the last valid closing tag, or -1 when none exists.
function findHtmlBoundaryBytes(buf: Uint8Array, len: number): number {
  let lastClosingTagEnd = -1
  let searchFrom = len - MIN_CLOSING_TAG_LENGTH

  while (searchFrom >= 0) {
    // Backwards search for "</" starting at or before searchFrom.
    let openSlash = -1
    for (let i = searchFrom; i >= 0; i--) {
      if (buf[i] === 60 && buf[i + 1] === 47) {
        openSlash = i
        break
      }
    }
    if (openSlash === -1) break

    // Fast case-insensitive match for </body>. Negative return encodes the
    // body start index without allocating a result object. Out-of-bounds
    // reads yield undefined, which fails every comparison below.
    if (
      ((buf[openSlash + 2] as number) | 32) === 98 &&
      ((buf[openSlash + 3] as number) | 32) === 111 &&
      ((buf[openSlash + 4] as number) | 32) === 100 &&
      ((buf[openSlash + 5] as number) | 32) === 121 &&
      buf[openSlash + 6] === 62
    ) {
      return -openSlash - 2
    }

    if (lastClosingTagEnd === -1) {
      let i = openSlash + 2
      const startCode = buf[i]
      if (
        (startCode! >= 97 && startCode! <= 122) ||
        (startCode! >= 65 && startCode! <= 90)
      ) {
        i++
        while (i < len) {
          const code = buf[i]
          if (
            (code! >= 97 && code! <= 122) || // a-z
            (code! >= 65 && code! <= 90) || // A-Z
            (code! >= 48 && code! <= 57) || // 0-9
            code === 95 || // _
            code === 58 || // :
            code === 46 || // .
            code === 45 // -
          ) {
            i++
          } else {
            break
          }
        }

        if (i < len && buf[i] === 62) {
          lastClosingTagEnd = i + 1
        }
      }
    }

    searchFrom = openSlash - 1
  }

  return lastClosingTagEnd
}

/**
 * Search buf[from, to) for `needle` using typed-array indexOf hops to the
 * first needle byte (memchr-backed in V8).
 */
function byteRangeContains(
  buf: Uint8Array,
  from: number,
  to: number,
  needle: Uint8Array,
): boolean {
  const n = needle.length
  if (n === 0 || to - from < n) return false
  const first = needle[0]!
  let i = buf.indexOf(first, from)
  while (i !== -1 && i <= to - n) {
    let match = true
    for (let j = 1; j < n; j++) {
      if (buf[i + j] !== needle[j]) {
        match = false
        break
      }
    }
    if (match) return true
    i = buf.indexOf(first, i + 1)
  }
  return false
}

/**
 * Releasing the lock can throw if a pending read is still settling or if the
 * lock was already released.
 */
type ReaderOps = {
  cancel: (reason?: unknown) => Promise<unknown>
  releaseLock: () => void
}

function safeReleaseReader(reader: ReaderOps) {
  try {
    reader.releaseLock()
    return true
  } catch {
    return false
  }
}

/**
 * Cancel a reader without producing an unhandled rejection. `reader.cancel()`
 * can reject (e.g. when the underlying source's cancel() throws), and
 * downstream cancel() should still wait for upstream teardown when possible.
 */
function safeCancelReader(reader: ReaderOps, reason?: unknown): Promise<void> {
  let cancelPromise: Promise<unknown> | undefined
  try {
    cancelPromise = reader.cancel(reason)
  } catch {
    // ignore
  }

  if (!safeReleaseReader(reader) && cancelPromise) {
    return cancelPromise.then(noop, noop).then(() => {
      safeReleaseReader(reader)
    })
  }

  return cancelPromise ? cancelPromise.then(noop, noop) : resolvedPromise
}

function createReaderState<T>(appStream: ReadableStream<T>) {
  const reader = appStream.getReader()
  let released = false

  return {
    reader,
    cancel: (reason?: unknown) => {
      if (released) return resolvedPromise
      released = true
      return safeCancelReader(reader, reason)
    },
    release: () => {
      if (released) return
      released = true
      safeReleaseReader(reader)
    },
  }
}

function createAbortNotifier(opts?: TransformStreamWithRouterOptions) {
  let abortNotified = false
  return (reason?: unknown) => {
    if (abortNotified) return
    abortNotified = true
    try {
      opts?.onAbort?.(reason)
    } catch {
      // swallow user errors
    }
  }
}

function listenToAbort(
  signal: AbortSignal | undefined,
  onAbort: (reason?: unknown) => void,
) {
  if (!signal) {
    return
  }
  if (signal.aborted) {
    onAbort(signal.reason)
    return
  }
  const listener = () => onAbort(signal.reason)
  signal.addEventListener('abort', listener, { once: true })
  return () => signal.removeEventListener('abort', listener)
}

export function transformStreamWithRouter(
  router: AnyRouter,
  appStream: ReadableStream,
  opts?: TransformStreamWithRouterOptions,
) {
  const serverSsr = router.serverSsr
  if (!serverSsr) {
    throw new Error('Invariant failed: router.serverSsr is required')
  }
  if (serverSsr.reserveStreamFastPath()) {
    return makeFastPathStream(appStream, opts, serverSsr)
  }

  return makeMainStream(serverSsr, appStream, opts)
}

// =====================================================================
// Fast path: passthrough with cleanup + backpressure on app reads.
// =====================================================================
function makeFastPathStream(
  appStream: ReadableStream<Uint8Array>,
  opts?: TransformStreamWithRouterOptions,
  serverSsr?: NonNullable<AnyRouter['serverSsr']>,
) {
  let cleanedUp = false
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let state: MergeState = MergeState.ReadingBody
  let lifetimeTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  let stopListeningToAbort: (() => void) | undefined
  let stopListeningToInjectedHtml: (() => void) | undefined
  const readerState = createReaderState(appStream)
  const notifyAbort = createAbortNotifier(opts)
  const isDone = () => state === MergeState.Done
  let renderFinished = false

  const finishSsrRendering = () => {
    if (!serverSsr || renderFinished) return true
    renderFinished = true
    try {
      serverSsr.setRenderFinished()
      return true
    } catch (error) {
      safeError(error)
      cleanup(error)
      return false
    }
  }

  const cleanup = (reason?: unknown, cancelReader = true) => {
    if (cleanedUp) return resolvedPromise
    cleanedUp = true

    if (lifetimeTimeoutHandle !== undefined) {
      clearTimeout(lifetimeTimeoutHandle)
      lifetimeTimeoutHandle = undefined
    }
    stopListeningToAbort?.()
    stopListeningToAbort = undefined
    try {
      stopListeningToInjectedHtml?.()
    } catch {
      // ignore
    }
    stopListeningToInjectedHtml = undefined

    if (cancelReader) {
      // Notify the producer immediately. Reader cancellation may take time to
      // settle, and upstream renderers must tolerate abort + cancel overlap.
      notifyAbort(reason)
    }
    const readerDone = cancelReader
      ? readerState.cancel(reason)
      : (readerState.release(), resolvedPromise)
    if (serverSsr) {
      try {
        serverSsr.cleanup()
      } catch (error) {
        console.error('Error in SSR cleanup:', error)
      }
    }
    return readerDone
  }

  const safeClose = () => {
    if (isDone()) return
    state = MergeState.Done
    try {
      controller?.close()
    } catch {
      // ignore
    }
  }

  const safeError = (error: unknown) => {
    if (isDone()) return
    state = MergeState.Done
    try {
      controller?.error(error)
    } catch {
      // ignore
    }
  }

  if (serverSsr) {
    stopListeningToInjectedHtml = serverSsr.onInjectedHtml(() => {
      const err = new Error('SSR router HTML injected during fast path')
      safeError(err)
      cleanup(err)
    })
  }

  const lifetimeMs = opts?.lifetimeMs ?? DEFAULT_LIFETIME_TIMEOUT_MS
  lifetimeTimeoutHandle = setTimeout(() => {
    if (!cleanedUp && !isDone()) {
      const err = new Error('Stream lifetime exceeded')
      console.warn(
        `SSR stream transform exceeded maximum lifetime (${lifetimeMs}ms), forcing cleanup`,
      )
      safeError(err)
      cleanup(err)
    }
  }, lifetimeMs)

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    async pull(c) {
      if (cleanedUp || isDone()) return
      try {
        const { done, value } = await readerState.reader.read()
        if (!done) {
          if (!cleanedUp && !isDone()) {
            c.enqueue(value)
          }
          return
        }

        if (cleanedUp || isDone()) return

        if (!finishSsrRendering()) return
        safeClose()
        return cleanup(undefined, false)
      } catch (error) {
        if (cleanedUp) return
        console.error('Error reading appStream:', error)
        if (state < MergeState.AppDone) {
          try {
            serverSsr?.setRenderFinished()
          } catch {
            // ignore
          }
        }
        safeError(error)
        return cleanup(error)
      } finally {
        if (cleanedUp || isDone()) {
          readerState.release()
        }
      }
    },
    cancel(reason) {
      state = MergeState.Done
      return cleanup(reason)
    },
  })

  stopListeningToAbort = listenToAbort(opts?.signal, (reason) => {
    safeError(reason)
    cleanup(reason)
  })

  return stream
}

// =====================================================================
// Main path: scan + inject router HTML/scripts with full backpressure.
//
// ALL output (app chunks AND router-injected HTML/scripts) flows through a
// single pendingWrites queue and is only enqueued onto the downstream
// controller when desiredSize > 0. This prevents native-memory growth of
// queued Uint8Arrays under slow HTTP consumers.
// =====================================================================
function makeMainStream(
  serverSsr: NonNullable<AnyRouter['serverSsr']>,
  appStream: ReadableStream,
  opts?: TransformStreamWithRouterOptions,
) {
  let stopListeningToInjectedHtml: (() => void) | undefined
  let stopListeningToSerializationFinished: (() => void) | undefined
  let serializationTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  let lifetimeTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  let stopListeningToAbort: (() => void) | undefined
  let cleanedUp = false

  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let closeWhenDrained = false
  let state: MergeState = MergeState.ReadingBody

  const readerState = createReaderState(appStream)
  const notifyAbort = createAbortNotifier(opts)

  // Single output queue: app chunks + router-injected HTML/scripts.
  // App chunks are stored as RAW BYTES and enqueued verbatim (no
  // decode/re-encode round trip); router HTML arrives as strings from
  // serverSsr and is encoded once at enqueue time. This keeps native-backed
  // Uint8Arrays only inside the controller's internal queue, not in two
  // places.
  //
  // Uses an index pointer instead of Array.prototype.shift() (which is O(n))
  // so many small router-injected script chunks stay O(1) per chunk.
  const pendingWrites: Array<string | Uint8Array> = []
  let pendingWriteHead = 0
  let pendingWriteSize = 0

  function clearPending() {
    pendingWrites.length = 0
    pendingWriteHead = 0
    pendingWriteSize = 0
  }

  // Backpressure: pull() resolves drainResolve to let the read loop advance.
  let drainResolve: (() => void) | null = null
  const waitForDrain = () =>
    new Promise<void>((r) => {
      drainResolve = r
    })
  const signalDrain = () => {
    if (drainResolve) {
      const r = drainResolve
      drainResolve = null
      r()
    }
  }

  const isDone = () => state === MergeState.Done

  function drainPending() {
    if (!controller || isDone()) return
    while (pendingWriteHead < pendingWrites.length) {
      const ds = controller.desiredSize
      if (ds !== null && ds <= 0) return
      const next = pendingWrites[pendingWriteHead]!
      // Release reference for GC; compact when fully drained.
      pendingWrites[pendingWriteHead] = ''
      pendingWriteHead++
      pendingWriteSize -= next.length
      try {
        controller.enqueue(
          typeof next === 'string' ? textEncoder.encode(next) : next,
        )
      } catch (error) {
        safeError(error)
        cleanup(error)
        return
      }
    }
    // Fully drained: reset array so it doesn't grow unbounded across SSR.
    if (pendingWriteHead >= pendingWrites.length) {
      pendingWrites.length = 0
      pendingWriteHead = 0
    }
    // If we've flushed everything and tryFinish requested close, close now.
    if (closeWhenDrained && pendingWriteHead >= pendingWrites.length) {
      closeWhenDrained = false
      safeClose()
      cleanup(undefined, false)
    }
  }

  /**
   * Enqueue a string chunk through the backpressure queue. Stored as a
   * string and encoded only when the downstream actually accepts the chunk
   * — keeps native-memory pressure inside the controller's queue (which
   * honors desiredSize) rather than ours. Used for router-injected HTML,
   * which arrives as strings from serverSsr.
   */
  function writeChunk(chunk: string) {
    if (cleanedUp || isDone()) return
    if (!chunk.length) return
    if (pendingWriteSize + chunk.length > MAX_PENDING_WRITE_CHARS) {
      const err = new Error('SSR stream pending output exceeded maximum buffer')
      safeError(err)
      cleanup(err)
      return
    }
    pendingWrites.push(chunk)
    pendingWriteSize += chunk.length
    drainPending()
  }

  /**
   * Enqueue raw app bytes verbatim — no decode/encode round trip. The bytes
   * must not alias upstream-owned buffers, which is guaranteed because all
   * writes come from `pendingBody.slice(...)` copies.
   */
  function writeRawBytes(bytes: Uint8Array) {
    if (cleanedUp || isDone()) return
    if (!bytes.length) return
    if (pendingWriteSize + bytes.length > MAX_PENDING_WRITE_CHARS) {
      const err = new Error('SSR stream pending output exceeded maximum buffer')
      safeError(err)
      cleanup(err)
      return
    }
    pendingWrites.push(bytes)
    pendingWriteSize += bytes.length
    drainPending()
  }

  function safeClose() {
    if (isDone()) return
    state = MergeState.Done
    try {
      controller?.close()
    } catch {
      // ignore
    }
  }

  function safeError(error: unknown) {
    if (isDone()) return
    state = MergeState.Done
    try {
      controller?.error(error)
    } catch {
      // ignore
    }
  }

  /**
   * Cleanup with guards; must be idempotent.
   */
  function cleanup(reason?: unknown, cancelReader = true) {
    if (cleanedUp) return resolvedPromise
    cleanedUp = true

    try {
      stopListeningToInjectedHtml?.()
      stopListeningToSerializationFinished?.()
    } catch {
      // ignore
    }
    stopListeningToInjectedHtml = undefined
    stopListeningToSerializationFinished = undefined
    stopListeningToAbort?.()
    stopListeningToAbort = undefined

    if (serializationTimeoutHandle !== undefined) {
      clearTimeout(serializationTimeoutHandle)
      serializationTimeoutHandle = undefined
    }
    if (lifetimeTimeoutHandle !== undefined) {
      clearTimeout(lifetimeTimeoutHandle)
      lifetimeTimeoutHandle = undefined
    }

    clearPendingRouterHtml()
    resetPendingBody()
    clearPending()

    if (cancelReader) {
      // Notify the producer immediately. Reader cancellation may take time to
      // settle, and upstream renderers must tolerate abort + cancel overlap.
      notifyAbort(reason)
    }
    const readerDone = cancelReader
      ? readerState.cancel(reason)
      : (readerState.release(), resolvedPromise)
    signalDrain()
    try {
      serverSsr.cleanup()
    } catch (error) {
      console.error('Error in SSR cleanup:', error)
    }
    return readerDone
  }

  // =====================================================================
  // Pending body buffer: raw UTF-8 bytes not yet emitted downstream.
  //
  // Before </body> is seen this holds the "leftover" bytes since the last
  // closing-tag boundary; afterwards it holds the captured tail. All app
  // bytes stay encoded exactly once (as produced upstream) and are enqueued
  // verbatim — the decoder/encoder round trip is gone entirely.
  //
  // Closing tags and the barrier marker are pure ASCII, and multi-byte
  // UTF-8 sequences never contain bytes < 0x80, so byte-level scanning and
  // byte-offset slicing are always text-safe.
  // =====================================================================
  let pendingBody = new Uint8Array(8 * 1024)
  let pendingBodyLen = 0

  // Absolute stream offset of pendingBody[0]; used to reason about which
  // bytes have already been scanned for the barrier marker.
  let regionStartAbs = 0
  // Every byte at absolute offset < markerScannedAbs has been included in a
  // barrier-marker search over a WRITTEN range (matching the previous
  // behavior of scanning only flushed chunks).
  let markerScannedAbs = 0
  // Total tail bytes held while state >= HoldingTail.
  let tailBytes = 0

  function resetPendingBody() {
    pendingBodyLen = 0
    regionStartAbs = 0
    markerScannedAbs = 0
    tailBytes = 0
  }

  function ensurePendingBodyCapacity(needed: number) {
    if (needed <= pendingBody.length) return
    let cap = pendingBody.length * 2
    if (cap < needed) cap = needed
    const next = new Uint8Array(cap)
    if (pendingBodyLen > 0) {
      next.set(pendingBody.subarray(0, pendingBodyLen))
    }
    pendingBody = next
  }

  /**
   * Append an upstream chunk to the pending body buffer. Copies immediately
   * so upstream-owned/reused Uint8Arrays are never aliased.
   */
  function appendToPendingBody(value: string | Uint8Array) {
    if (typeof value === 'string') {
      ensurePendingBodyCapacity(pendingBodyLen + value.length * 3 + 1)
      const res = textEncoder.encodeInto(
        value,
        pendingBody.subarray(pendingBodyLen),
      )
      pendingBodyLen += res.written
      return
    }
    const len = value.byteLength
    ensurePendingBodyCapacity(pendingBodyLen + len)
    if (len > 0) {
      pendingBody.set(value, pendingBodyLen)
      pendingBodyLen += len
    }
  }

  /**
   * Search the written prefix [regionStartAbs, endRel) for the barrier
   * marker. Only bytes that have actually been written downstream count as
   * "seen" — lifting the barrier before the marker script has been fully
   * flushed could allow injections inside the marker script tag itself.
   */
  function scanWrittenPrefixForMarker(endRel: number) {
    if (streamBarrierMarkerSeen) return
    const endAbs = regionStartAbs + endRel
    let fromAbs = markerScannedAbs - (BARRIER_MARKER_BYTES.length - 1)
    if (fromAbs < regionStartAbs) fromAbs = regionStartAbs
    if (endAbs > markerScannedAbs) markerScannedAbs = endAbs
    if (endAbs <= fromAbs) return
    if (
      byteRangeContains(
        pendingBody,
        fromAbs - regionStartAbs,
        endRel,
        BARRIER_MARKER_BYTES,
      )
    ) {
      streamBarrierMarkerSeen = true
    }
  }

  /**
   * Copy out and enqueue the body prefix [0, k), then compact the buffer.
   * `scanMarker` mirrors the previous behavior of checking the barrier
   * marker only on chunks flushed at safe boundaries.
   */
  function emitBodyPrefix(k: number, scanMarker: boolean) {
    if (k <= 0 || pendingBodyLen === 0) return
    if (k > pendingBodyLen) k = pendingBodyLen
    if (scanMarker && state < MergeState.HoldingTail) {
      scanWrittenPrefixForMarker(k)
    }
    const out = pendingBody.slice(0, k)
    writeRawBytes(out)
    pendingBody.copyWithin(0, k, pendingBodyLen)
    pendingBodyLen -= k
    regionStartAbs += k
  }

  // Router-injected scripts/HTML waiting for the next safe body boundary.
  // Keep chunks separate so flushing does not flatten a large rope string.
  const pendingRouterHtml: Array<string> = []
  let pendingRouterHtmlChars = 0

  let streamBarrierLifted = false
  let streamBarrierMarkerSeen = false
  let serializationFinished = false

  function liftBarrierAfterBoundary() {
    if (streamBarrierLifted) return
    if (!streamBarrierMarkerSeen) return
    streamBarrierLifted = true
    serverSsr.liftScriptBarrier()
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
      // If anything queued before start (shouldn't happen but be safe), drain.
      drainPending()
    },
    pull() {
      // Consumer has capacity; flush queue then unblock read loop.
      drainPending()
      signalDrain()
    },
    cancel(reason) {
      state = MergeState.Done
      return cleanup(reason)
    },
  })

  function drainRouterHtml() {
    if (cleanedUp || isDone()) return
    let html: string | undefined
    try {
      html = serverSsr.takeBufferedHtml()
    } catch (error) {
      safeError(error)
      cleanup(error)
      return
    }
    if (!html) return
    if (state >= MergeState.Draining) {
      // At this point final tail/close has already been queued. Emitting late
      // router HTML would put scripts after </body> or drop them silently.
      const err = new Error(
        'SSR router HTML injected after stream finalization',
      )
      safeError(err)
      cleanup(err)
      return
    }
    if (state === MergeState.HoldingTail) {
      flushPendingRouterHtml()
      writeChunk(html)
    } else {
      if (pendingRouterHtmlChars + html.length > MAX_ROUTER_HTML_CHARS) {
        const err = new Error('SSR router HTML exceeded maximum buffer')
        safeError(err)
        cleanup(err)
        return
      }
      pendingRouterHtml.push(html)
      pendingRouterHtmlChars += html.length
    }
  }

  function flushPendingRouterHtml() {
    if (!pendingRouterHtml.length) return
    for (const html of pendingRouterHtml) {
      writeChunk(html)
    }
    clearPendingRouterHtml()
  }

  function clearPendingRouterHtml() {
    pendingRouterHtml.length = 0
    pendingRouterHtmlChars = 0
  }

  function waitForBackpressure() {
    return !!(
      controller &&
      controller.desiredSize !== null &&
      controller.desiredSize <= 0
    )
  }

  function startSerializationTimeout() {
    if (cleanedUp || isDone()) return
    if (serializationTimeoutHandle !== undefined) return
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_SERIALIZATION_TIMEOUT_MS
    serializationTimeoutHandle = setTimeout(() => {
      if (!cleanedUp && !isDone()) {
        const err = new Error('Serialization timeout after app render finished')
        console.error('Serialization timeout after app render finished')
        safeError(err)
        cleanup(err)
      }
    }, timeoutMs)
  }

  /**
   * Finish only when app done and serialization complete. Queues final
   * output and requests close-when-drained so we don't close ahead of
   * pending writes still waiting on downstream capacity.
   */
  function tryFinish() {
    if (state !== MergeState.AppDone || !serializationFinished) return
    if (cleanedUp || isDone()) return

    if (serializationTimeoutHandle !== undefined) {
      clearTimeout(serializationTimeoutHandle)
      serializationTimeoutHandle = undefined
    }

    drainRouterHtml()
    if (cleanedUp || isDone()) return

    // If </body> never arrived, everything still buffered is pre-tail body
    // content ("leftover") and must precede injected router HTML.
    if (state < MergeState.HoldingTail && pendingBodyLen > 0) {
      const out = pendingBody.slice(0, pendingBodyLen)
      writeRawBytes(out)
      pendingBodyLen = 0
      regionStartAbs += out.length
    }
    if (cleanedUp || isDone()) return
    flushPendingRouterHtml()
    if (cleanedUp || isDone()) return
    // Captured tail bytes (from </body> onward) go last, behind scripts.
    if (pendingBodyLen > 0) {
      const out = pendingBody.slice(0, pendingBodyLen)
      writeRawBytes(out)
      pendingBodyLen = 0
      regionStartAbs += out.length
    }
    if (cleanedUp || isDone()) return

    state = MergeState.Draining
    closeWhenDrained = true
    // Try immediately; if queue not drained yet, pull() will retry.
    drainPending()
  }

  function finishAppRendering() {
    if (state >= MergeState.AppDone) return
    state = MergeState.AppDone
    try {
      serverSsr.setRenderFinished()
    } catch (error) {
      safeError(error)
      cleanup(error)
      return
    }
    drainRouterHtml()
    if (cleanedUp || isDone()) return
    serializationFinished =
      serializationFinished || serverSsr.isSerializationFinished()
    if (serializationFinished) {
      tryFinish()
    } else {
      startSerializationTimeout()
    }
  }

  // Safety net: cleanup even if consumer never reads
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_SERIALIZATION_TIMEOUT_MS
  const lifetimeMs = opts?.lifetimeMs ?? timeoutMs * 2
  lifetimeTimeoutHandle = setTimeout(() => {
    if (!cleanedUp && !isDone()) {
      const err = new Error('Stream lifetime exceeded')
      console.warn(
        `SSR stream transform exceeded maximum lifetime (${lifetimeMs}ms), forcing cleanup`,
      )
      safeError(err)
      cleanup(err)
    }
  }, lifetimeMs)

  stopListeningToInjectedHtml = serverSsr.onInjectedHtml(() => {
    drainRouterHtml()
  })

  stopListeningToSerializationFinished = serverSsr.onSerializationFinished(
    () => {
      serializationFinished = true
      drainRouterHtml()
      tryFinish()
    },
  )

  // Subscriptions are installed before snapshots, so missed events are
  // recovered by these synchronous drains/rechecks.
  drainRouterHtml()
  if (cleanedUp || isDone()) return stream
  serializationFinished =
    serializationFinished || serverSsr.isSerializationFinished()
  if (serializationFinished) {
    drainRouterHtml()
    if (cleanedUp || isDone()) return stream
  }

  stopListeningToAbort = listenToAbort(opts?.signal, (reason) => {
    safeError(reason)
    cleanup(reason)
  })
  if (cleanedUp || isDone())
    return stream

    // Transform the appStream
  ;(async () => {
    try {
      while (true) {
        // Backpressure: pause upstream reads while downstream is full.
        if (waitForBackpressure()) {
          await waitForDrain()
          if (cleanedUp || isDone()) return
        }

        const { done, value } = await readerState.reader.read()
        if (done) break

        if (cleanedUp || isDone()) return

        // Keep app bytes encoded exactly once: append raw bytes (or encode
        // string chunks directly into the buffer) — no streaming decode.
        const chunkStart = regionStartAbs + pendingBodyLen
        appendToPendingBody(value as string | Uint8Array)
        const chunkBytes = regionStartAbs + pendingBodyLen - chunkStart
        if (chunkBytes === 0) continue

        // If we already saw </body>, everything else is tail. Keep it bounded
        // and held until router scripts are ready so injection remains before </body>.
        if (state >= MergeState.HoldingTail) {
          tailBytes += chunkBytes
          if (tailBytes > MAX_TAIL_CHARS) {
            throw new Error('SSR stream tail exceeded maximum buffer')
          }
          continue
        }

        const boundary = findHtmlBoundaryBytes(pendingBody, pendingBodyLen)
        if (boundary < -1) {
          const bodyEndIndex = -boundary - 2
          // Scan/write the body prefix while still in ReadingBody so the
          // barrier marker inside it is detected (the scan is gated on
          // state < HoldingTail).
          emitBodyPrefix(bodyEndIndex, true)
          if (cleanedUp || isDone()) return
          state = MergeState.HoldingTail
          tailBytes = pendingBodyLen
          if (tailBytes > MAX_TAIL_CHARS) {
            throw new Error('SSR stream tail exceeded maximum buffer')
          }
          liftBarrierAfterBoundary()
          if (cleanedUp || isDone()) return
          flushPendingRouterHtml()
          continue
        }

        const lastClosingTagEnd = boundary

        if (lastClosingTagEnd > 0) {
          emitBodyPrefix(lastClosingTagEnd, true)
          if (cleanedUp || isDone()) return
          liftBarrierAfterBoundary()
          if (cleanedUp || isDone()) return
          flushPendingRouterHtml()

          if (pendingBodyLen > MAX_LEFTOVER_CHARS) {
            // Ensure bounded memory even if a consumer streams long text sequences
            // without any closing tags. This may reduce injection granularity but is correct.
            emitBodyPrefix(pendingBodyLen - MAX_LEFTOVER_CHARS, true)
          }
        } else {
          // No closing tag found; keep small tail to handle split closing tags,
          // but stream older bytes to prevent unbounded buffering.
          if (pendingBodyLen > MAX_LEFTOVER_CHARS) {
            emitBodyPrefix(pendingBodyLen - MAX_LEFTOVER_CHARS, true)
          }
        }
      }

      if (cleanedUp || isDone()) return

      finishAppRendering()
    } catch (error) {
      if (cleanedUp) return
      console.error('Error reading appStream:', error)
      if (state < MergeState.AppDone) {
        try {
          serverSsr.setRenderFinished()
        } catch {
          // ignore
        }
      }
      safeError(error)
      cleanup(error)
    } finally {
      readerState.release()
    }
  })().catch((error) => {
    if (cleanedUp) return
    console.error('Error in stream transform:', error)
    safeError(error)
    cleanup(error)
  })

  return stream
}
