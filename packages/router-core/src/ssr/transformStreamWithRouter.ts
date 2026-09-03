import { ReadableStream } from 'node:stream/web'
import { Readable } from 'node:stream'
import {
  DOCUMENT_CLOSE_ANCHOR_INDEX,
  DOCUMENT_CLOSE_BYTES,
  SCRIPT_CLOSE_ANCHOR_INDEX,
  SCRIPT_CLOSE_BYTES,
  advanceByteMatcher,
  findExactBytes,
  getExactBytesPrefixAtEnd,
} from './htmlBoundaryScanner'
import {
  HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX,
  HYDRATION_SCRIPT_BOUNDARY_BYTES,
  HydrationScriptOutputState,
} from './hydrationScripts'
import type {
  ReadableStreamDefaultReader as NodeReadableStreamDefaultReader,
  ReadableStreamReadResult as NodeReadableStreamReadResult,
  ReadableStreamReadValueResult as NodeReadableStreamReadValueResult,
} from 'node:stream/web'
import type { AnyRouter } from '../router'
import type { ByteMatcherState } from './htmlBoundaryScanner'
import type { HydrationScriptOutput } from './hydrationScripts'

export type TransformStreamWithRouterOptions = {
  /** Timeout for serialization to complete after app render finishes (default: 60000ms) */
  timeoutMs?: number
  /** Maximum lifetime of the stream transform. Defaults to twice timeoutMs. */
  lifetimeMs?: number
  /** Cancels the transform and releases SSR state when the request ends. */
  signal?: AbortSignal
  /**
   * Additional point after which the renderer guarantees that a router script
   * can be inserted. This is an adapter contract, not a user streaming policy.
   * The router boundary, canonical document close, and EOF are always safe.
   */
  rendererSafePoint?: 'script-close' | 'record-end'
  /**
   * Called exactly once when the stream is torn down due to abort/error/
   * cancel/timeout — NOT on natural successful completion. Use this to
   * abort a hidden producer upstream of any stream passed to this transform.
   * Errors thrown from this callback are swallowed.
   */
  onAbort?: (reason?: unknown) => void
}

type AppStreamValue = Uint8Array | string

export function transformPipeableStreamWithRouter(
  router: AnyRouter,
  routerStream: Readable,
  opts?: TransformStreamWithRouterOptions,
) {
  return Readable.fromWeb(
    transformReadableStreamWithRouter(
      router,
      Readable.toWeb(routerStream) as ReadableStream<AppStreamValue>,
      opts,
    ),
  )
}

export async function transformHtmlStringWithRouter(
  router: AnyRouter,
  html: string,
  opts?: TransformStreamWithRouterOptions,
) {
  const serverSsr = router.serverSsr
  if (!serverSsr) {
    throw new Error('Invariant failed: router.serverSsr is required')
  }
  const hydrationScripts = serverSsr.hydrationScripts
  if (hydrationScripts.reserveFastPath()) {
    try {
      opts?.signal?.throwIfAborted()
      serverSsr.setRenderFinished()
      opts?.signal?.throwIfAborted()
      return '<!DOCTYPE html>' + html
    } catch (error) {
      try {
        opts?.onAbort?.(error)
      } catch {
        // User cleanup must not block SSR cleanup.
      }
      throw error
    } finally {
      serverSsr.cleanup()
    }
  }

  let sourceIndex = 0
  const sources = ['<!DOCTYPE html>', html]
  let sourceOffset = 0
  const appStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      while (sourceIndex < sources.length) {
        const source = sources[sourceIndex]!
        if (sourceOffset >= source.length) {
          sourceIndex++
          sourceOffset = 0
          continue
        }
        const encoded = encodeStringSource(source, sourceOffset)
        sourceOffset += encoded.read
        if (encoded.bytes.length > 0) {
          controller.enqueue(encoded.bytes)
          return
        }
      }
      controller.close()
    },
  })
  const output = transformReadableStreamWithRouter(router, appStream, opts)
  return readUtf8Stream(output)
}

async function readUtf8Stream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

const DEFAULT_SERIALIZATION_TIMEOUT_MS = 60_000
const MIN_APPLICATION_STRING_CHUNK_BYTES = 256
const MAX_APPLICATION_STRING_CHUNK_BYTES = 64 * 1024

const ApplicationPhase = {
  BeforeBoundary: 0,
  Merge: 1,
  HeldClose: 2,
  PassThrough: 3,
} as const

type ApplicationPhase = (typeof ApplicationPhase)[keyof typeof ApplicationPhase]
type Termination = 'complete' | 'cancel' | 'failure'
type AppStreamReader = NodeReadableStreamDefaultReader<AppStreamValue>

const textEncoder = new TextEncoder()

function releaseReader(reader: AppStreamReader) {
  try {
    reader.releaseLock()
  } catch {
    // A nonstandard reader may still reject lock release.
  }
}

function cancelReader(reader: AppStreamReader, reason?: unknown) {
  const cancelled = reader.cancel(reason).catch(() => {})
  // Native readers close synchronously when cancel() starts. Release the lock
  // before an arbitrary underlying cancel promise has a chance to park.
  releaseReader(reader)
  return cancelled
}

function finalizeSsrStream(
  kind: Termination,
  reason: unknown,
  controller: ReadableStreamDefaultController<Uint8Array>,
  reader: AppStreamReader,
  serverSsr: NonNullable<AnyRouter['serverSsr']>,
  onAbort?: (reason?: unknown) => void,
) {
  try {
    if (kind === 'complete') {
      controller.close()
    } else if (kind === 'failure') {
      controller.error(reason)
    }
  } catch {
    // The stream already reached a terminal state.
  }

  const aborted = kind !== 'complete'
  if (aborted) {
    try {
      onAbort?.(reason)
    } catch {
      // User cleanup must not block SSR cleanup.
    }
  }

  const readerDone = aborted
    ? cancelReader(reader, reason)
    : releaseReader(reader)
  serverSsr.cleanup()
  return readerDone
}

function getLifetimeMs(opts?: TransformStreamWithRouterOptions) {
  return (
    opts?.lifetimeMs ??
    (opts?.timeoutMs ?? DEFAULT_SERIALIZATION_TIMEOUT_MS) * 2
  )
}

// External serverSsr.cleanup() severs router ownership. The transform must
// release the renderer, timers, listeners, and buffers immediately instead of
// retaining them until the lifetime backstop fires. AbortError identifies this
// intentional cancellation to downstream consumers.
function createCleanupAbortError() {
  const error = new Error('SSR stream transform aborted by router SSR cleanup')
  error.name = 'AbortError'
  return error
}

function listenForAbort(
  signal: AbortSignal | undefined,
  onAbort: (reason: unknown) => void,
) {
  if (!signal) {
    return undefined
  }
  const listener = () => onAbort(signal.reason)
  signal.addEventListener('abort', listener, { once: true })
  return () => signal.removeEventListener('abort', listener)
}

/**
 * Create a timer that does not keep the Node.js process alive when this
 * last-resort stream backstop is the only remaining work.
 *
 * Node's global `setTimeout()` returns a `Timeout` object with `unref()`.
 * Web-standard runtimes return a numeric timer ID instead. Cloudflare Workers
 * retain that Web behavior for global timers even when `nodejs_compat` is
 * enabled. Accessing an optional property on a numeric ID is safe, so timer
 * creation can normalize the Node-only capability without allocating a
 * wrapper object. The native handle is returned unchanged for `clearTimeout`.
 */
function setUnrefTimeout(callback: () => void, timeoutMs: number) {
  const handle = setTimeout(callback, timeoutMs)
  const portableHandle = handle as typeof handle & { unref?: () => void }
  portableHandle.unref?.()
  return handle
}

/**
 * Arm the shared teardown triggers of a transform stream: the lifetime
 * backstop timer, the request-abort listener, and the external-cleanup
 * listener. Returns a disarm function that `terminate()` calls exactly once;
 * teardown ordering must stay identical between the fast and merge paths.
 */
function armStreamLifecycle(
  serverSsr: NonNullable<AnyRouter['serverSsr']>,
  opts: TransformStreamWithRouterOptions | undefined,
  isTerminal: () => boolean,
  terminate: (kind: Termination, reason?: unknown) => unknown,
) {
  let lifetimeTimeoutHandle: ReturnType<typeof setTimeout> | undefined
  let stopAbortListener: (() => void) | undefined
  const disarm = () => {
    stopAbortListener?.()
    stopAbortListener = undefined
    if (lifetimeTimeoutHandle !== undefined) {
      clearTimeout(lifetimeTimeoutHandle)
      lifetimeTimeoutHandle = undefined
    }
  }

  const lifetimeMs = getLifetimeMs(opts)
  lifetimeTimeoutHandle = setUnrefTimeout(() => {
    if (isTerminal()) {
      return
    }
    const error = new Error('Stream lifetime exceeded')
    console.warn(
      `SSR stream transform exceeded maximum lifetime (${lifetimeMs}ms), forcing cleanup`,
    )
    terminate('failure', error)
  }, lifetimeMs)
  stopAbortListener = listenForAbort(opts?.signal, (reason) => {
    terminate('failure', reason)
  })
  // External serverSsr.cleanup() must release the reader, renderer, timer,
  // and buffers promptly — a parked pump only wakes through its own
  // subscriptions, and a discarded response never pulls at all.
  serverSsr.onCleanup(() => {
    if (!isTerminal()) {
      terminate('failure', createCleanupAbortError())
    }
  })
  return disarm
}

function cleanupFailedStreamCreation(
  serverSsr: NonNullable<AnyRouter['serverSsr']>,
  onAbort: TransformStreamWithRouterOptions['onAbort'],
  error: unknown,
) {
  try {
    onAbort?.(error)
  } catch {
    // User cleanup must not block SSR cleanup.
  }
  serverSsr.cleanup()
}

function encodeStringSource(value: string, offset: number) {
  const remaining = value.length - offset
  const capacity = Math.min(
    MAX_APPLICATION_STRING_CHUNK_BYTES,
    Math.max(
      MIN_APPLICATION_STRING_CHUNK_BYTES,
      Math.min(value.length, remaining * 3),
    ),
  )
  const output = new Uint8Array(capacity)
  // Keep a valid UTF-16 surrogate pair in one slice so chunking cannot change
  // how the original string is encoded.
  let sliceEnd = Math.min(value.length, offset + output.length)
  if (
    sliceEnd < value.length &&
    value.charCodeAt(sliceEnd - 1) >= 0xd800 &&
    value.charCodeAt(sliceEnd - 1) <= 0xdbff &&
    value.charCodeAt(sliceEnd) >= 0xdc00 &&
    value.charCodeAt(sliceEnd) <= 0xdfff
  ) {
    sliceEnd--
  }
  const { read, written } = textEncoder.encodeInto(
    value.slice(offset, sliceEnd),
    output,
  )
  if (read === 0 && remaining > 0) {
    throw new Error('SSR string encoder made no progress')
  }
  return {
    bytes: written === output.length ? output : output.subarray(0, written),
    read,
  }
}

export function transformReadableStreamWithRouter(
  router: AnyRouter,
  appStream: ReadableStream<AppStreamValue>,
  opts?: TransformStreamWithRouterOptions,
) {
  const serverSsr = router.serverSsr
  if (!serverSsr) {
    throw new Error('Invariant failed: router.serverSsr is required')
  }
  const hydrationScripts = serverSsr.hydrationScripts

  let reader: AppStreamReader
  try {
    reader = appStream.getReader() as AppStreamReader
  } catch (error) {
    cleanupFailedStreamCreation(serverSsr, opts?.onAbort, error)
    throw error
  }

  try {
    opts?.signal?.throwIfAborted()
    if (hydrationScripts.reserveFastPath()) {
      return makeFastPathStream(serverSsr, reader, opts)
    }
    const hydrationOutput = hydrationScripts.claimOutput()
    if (hydrationOutput.state === HydrationScriptOutputState.Failed) {
      throw hydrationOutput.error
    }
    return makeMergeStream(serverSsr, reader, hydrationOutput, opts)
  } catch (error) {
    void cancelReader(reader, error)
    cleanupFailedStreamCreation(serverSsr, opts?.onAbort, error)
    throw error
  }
}

// The fast path forwards renderer bytes without scanning or copying them.
function makeFastPathStream(
  serverSsr: NonNullable<AnyRouter['serverSsr']>,
  reader: AppStreamReader,
  opts?: TransformStreamWithRouterOptions,
) {
  let terminal = false
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let appString: string | undefined
  let appStringOffset = 0

  function terminate(kind: Termination, reason?: unknown) {
    if (terminal) {
      return
    }
    terminal = true
    disarmLifecycle()
    appString = undefined
    return finalizeSsrStream(
      kind,
      reason,
      controller,
      reader,
      serverSsr,
      opts?.onAbort,
    )
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    async pull(c) {
      if (terminal) {
        return
      }
      try {
        for (;;) {
          if (appString !== undefined) {
            const encoded = encodeStringSource(appString, appStringOffset)
            appStringOffset += encoded.read
            if (appStringOffset === appString.length) {
              appString = undefined
              appStringOffset = 0
            }
            if (encoded.bytes.byteLength > 0) {
              c.enqueue(encoded.bytes)
              return
            }
            continue
          }
          const { done, value } = await reader.read()
          if (terminal) {
            return
          }
          if (done) {
            serverSsr.setRenderFinished()
            return terminate('complete')
          }
          if (typeof value === 'string') {
            if (value.length > 0) {
              appString = value
            }
          } else if (value.byteLength > 0) {
            c.enqueue(value)
            return
          }
        }
      } catch (error) {
        if (terminal) {
          return
        }
        console.error('Error processing appStream:', error)
        return terminate('failure', error)
      }
    },
    cancel(reason) {
      return terminate('cancel', reason)
    },
  })

  const disarmLifecycle = armStreamLifecycle(
    serverSsr,
    opts,
    () => terminal,
    terminate,
  )

  return stream
}

// The merge path searches only router- and renderer-owned ASCII delimiters.
// Application bytes otherwise leave through zero-copy subarray views.
function makeMergeStream(
  serverSsr: NonNullable<AnyRouter['serverSsr']>,
  reader: AppStreamReader,
  hydrationOutput: HydrationScriptOutput,
  opts?: TransformStreamWithRouterOptions,
) {
  const hydrationScripts = serverSsr.hydrationScripts
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let terminal = false
  let appDone = false
  let applicationPhase: ApplicationPhase = ApplicationPhase.BeforeBoundary
  let insertionBoundary = false

  let stopHydrationOutputListener: (() => void) | undefined
  let appReadPending = false
  let settledAppRead:
    | NodeReadableStreamReadValueResult<AppStreamValue>
    | undefined

  let appBytes: Uint8Array | undefined
  let appOffset = 0
  let appString: string | undefined
  let appStringOffset = 0

  const useScriptCloseSafePoints = opts?.rendererSafePoint === 'script-close'
  const useRecordEndSafePoints = opts?.rendererSafePoint === 'record-end'

  const barrierMatcher: ByteMatcherState = {
    pattern: HYDRATION_SCRIPT_BOUNDARY_BYTES,
    anchorIndex: HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX,
    matched: 0,
  }
  let safePointMatcher: ByteMatcherState | undefined
  // Split document closes carry at most 13 bytes across chunks. This uses
  // findExactBytes + getExactBytesPrefixAtEnd instead of advanceByteMatcher
  // because `</body></html>` repeats its first byte (`<` at 0 and 7), which
  // violates the matcher's unique-first-byte resync precondition.
  let closeCarry: Uint8Array | undefined

  let wakeResolve: (() => void) | undefined

  function waitForWake() {
    return new Promise<void>((resolve) => {
      wakeResolve = resolve
    })
  }

  function wakePump() {
    const resolve = wakeResolve
    wakeResolve = undefined
    resolve?.()
  }

  // Returns true when a chunk was enqueued. Every process* function
  // propagates this boolean so pump() emits at most one chunk per downstream
  // pull — the backpressure contract of this transform.
  function enqueueAppBytes(value: Uint8Array) {
    if (value.length === 0) {
      return false
    }
    controller.enqueue(value)
    return true
  }

  function finishAppChunk() {
    appBytes = undefined
    if (
      appString === undefined &&
      useRecordEndSafePoints &&
      closeCarry === undefined
    ) {
      insertionBoundary = true
    }
  }

  function loadNextAppStringChunk() {
    const value = appString!
    const encoded = encodeStringSource(value, appStringOffset)
    appStringOffset += encoded.read
    appBytes = encoded.bytes
    appOffset = 0
    if (appStringOffset === value.length) {
      appString = undefined
    }
  }

  function processUntilBarrier() {
    const value = appBytes!
    if (!hydrationScripts.isInitialTaken()) {
      // The rendered boundary can only exist after the initial script take,
      // so earlier renderer bytes pass through without scanning. This skips
      // the barrier scan for the whole pre-<Scripts> document and prevents
      // barrier-lookalike bytes in application content from lifting the
      // barrier early.
      const remainder = appOffset === 0 ? value : value.subarray(appOffset)
      finishAppChunk()
      return enqueueAppBytes(remainder)
    }
    const matchEnd = advanceByteMatcher(barrierMatcher, value, appOffset)
    if (matchEnd === undefined) {
      const remainder = appOffset === 0 ? value : value.subarray(appOffset)
      finishAppChunk()
      return enqueueAppBytes(remainder)
    }

    const throughBarrier =
      appOffset === 0 && matchEnd === value.length
        ? value
        : value.subarray(appOffset, matchEnd)
    appOffset = matchEnd
    const emitted = enqueueAppBytes(throughBarrier)
    applicationPhase = ApplicationPhase.Merge
    insertionBoundary = true
    hydrationScripts.liftBarrier()
    if (appOffset === value.length) {
      finishAppChunk()
    }
    return emitted
  }

  function holdDocumentClose(matchStart: number) {
    const value = appBytes!
    const prefix =
      matchStart === appOffset
        ? undefined
        : value.subarray(appOffset, matchStart)
    appOffset = matchStart + DOCUMENT_CLOSE_BYTES.length
    applicationPhase = ApplicationPhase.HeldClose
    if (safePointMatcher) {
      // The removed close breaks byte continuity with later renderer bytes.
      safePointMatcher.matched = 0
    }
    insertionBoundary = true
    if (appOffset === value.length) {
      finishAppChunk()
    }
    return prefix ? enqueueAppBytes(prefix) : false
  }

  function processUntilSafePoint(endIndex: number) {
    const value = appBytes!
    const matchEnd = findSafePointEnd(value, appOffset, endIndex)
    if (matchEnd === undefined) {
      return false
    }

    const throughSafePoint =
      appOffset === 0 && matchEnd === value.length
        ? value
        : value.subarray(appOffset, matchEnd)
    appOffset = matchEnd
    insertionBoundary = true
    if (appOffset === value.length) {
      finishAppChunk()
    }
    return enqueueAppBytes(throughSafePoint)
  }

  function findSafePointEnd(
    value: Uint8Array,
    startIndex: number,
    endIndex: number,
  ) {
    const hydrationState = hydrationOutput.state
    if (
      endIndex === startIndex ||
      hydrationState === HydrationScriptOutputState.Done
    ) {
      return undefined
    }

    const scanValue =
      endIndex === value.length ? value : value.subarray(0, endIndex)
    const matcher = (safePointMatcher ??= {
      pattern: SCRIPT_CLOSE_BYTES,
      anchorIndex: SCRIPT_CLOSE_ANCHOR_INDEX,
      matched: 0,
    })
    const outputReady = hydrationState === HydrationScriptOutputState.Ready
    const matchEnd = advanceByteMatcher(
      matcher,
      scanValue,
      startIndex,
      !outputReady,
    )
    if (matchEnd === undefined) {
      return undefined
    }
    if (!outputReady) {
      // Bytes after the last match are processed again on the next pull.
      matcher.matched = 0
    }
    return matchEnd
  }

  function processCloseCarry() {
    const value = appBytes!
    const carry = closeCarry!
    const headLength = Math.min(
      value.length - appOffset,
      DOCUMENT_CLOSE_BYTES.length,
    )
    const combined = new Uint8Array(carry.length + headLength)
    combined.set(carry)
    combined.set(
      value.subarray(appOffset, appOffset + headLength),
      carry.length,
    )

    const matchStart = findExactBytes(
      combined,
      DOCUMENT_CLOSE_BYTES,
      0,
      DOCUMENT_CLOSE_ANCHOR_INDEX,
    )
    const partial =
      matchStart < 0
        ? getExactBytesPrefixAtEnd(combined, DOCUMENT_CLOSE_BYTES)
        : undefined
    const safeEnd = matchStart >= 0 ? matchStart : (partial ?? combined.length)

    if (useScriptCloseSafePoints) {
      const safePointEnd = findSafePointEnd(combined, 0, safeEnd)
      if (safePointEnd !== undefined) {
        appOffset += safePointEnd - carry.length
        closeCarry = undefined
        insertionBoundary = true
        if (appOffset === value.length) {
          finishAppChunk()
        }
        return enqueueAppBytes(combined.subarray(0, safePointEnd))
      }
    }

    if (matchStart >= 0) {
      const consumedFromValue =
        matchStart + DOCUMENT_CLOSE_BYTES.length - carry.length
      appOffset += consumedFromValue
      closeCarry = undefined
      applicationPhase = ApplicationPhase.HeldClose
      if (safePointMatcher) {
        // The removed close breaks byte continuity with later renderer bytes.
        safePointMatcher.matched = 0
      }
      insertionBoundary = true
      if (appOffset === value.length) {
        finishAppChunk()
      }
      return matchStart === 0
        ? false
        : enqueueAppBytes(combined.subarray(0, matchStart))
    }

    closeCarry = partial === undefined ? undefined : combined.slice(partial)
    appOffset += headLength
    return enqueueAppBytes(
      safeEnd === combined.length ? combined : combined.subarray(0, safeEnd),
    )
  }

  function processUntilDocumentClose() {
    const value = appBytes!

    if (closeCarry) {
      if (processCloseCarry()) {
        return true
      }
      if (applicationPhase === ApplicationPhase.HeldClose) {
        return false
      }
      if (appOffset >= value.length) {
        finishAppChunk()
        return false
      }
    }

    const matchStart = findExactBytes(
      value,
      DOCUMENT_CLOSE_BYTES,
      appOffset,
      DOCUMENT_CLOSE_ANCHOR_INDEX,
    )
    if (matchStart >= 0) {
      if (useScriptCloseSafePoints && processUntilSafePoint(matchStart)) {
        return true
      }
      return holdDocumentClose(matchStart)
    }

    const partial = getExactBytesPrefixAtEnd(
      value,
      DOCUMENT_CLOSE_BYTES,
      appOffset,
    )
    const safeEnd = partial ?? value.length
    if (useScriptCloseSafePoints && processUntilSafePoint(safeEnd)) {
      return true
    }
    const output =
      appOffset === 0 && safeEnd === value.length
        ? value
        : value.subarray(appOffset, safeEnd)
    closeCarry = partial === undefined ? undefined : value.slice(partial)
    finishAppChunk()
    return enqueueAppBytes(output)
  }

  function processAppChunk() {
    if (appOffset >= appBytes!.length) {
      finishAppChunk()
      return false
    }
    insertionBoundary = false
    if (applicationPhase === ApplicationPhase.BeforeBoundary) {
      return processUntilBarrier()
    }
    if (applicationPhase === ApplicationPhase.Merge) {
      return processUntilDocumentClose()
    }
    const value = appBytes!
    if (useScriptCloseSafePoints && processUntilSafePoint(value.length)) {
      return true
    }

    const remainder = appOffset === 0 ? value : value.subarray(appOffset)
    finishAppChunk()
    return enqueueAppBytes(remainder)
  }

  function terminate(kind: Termination, reason?: unknown) {
    if (terminal) {
      return
    }
    terminal = true

    stopHydrationOutputListener?.()
    stopHydrationOutputListener = undefined
    disarmLifecycle()

    settledAppRead = undefined
    appBytes = undefined
    appString = undefined
    closeCarry = undefined
    wakePump()

    return finalizeSsrStream(
      kind,
      reason,
      controller,
      reader,
      serverSsr,
      opts?.onAbort,
    )
  }

  function startAppRead() {
    if (appReadPending || settledAppRead || terminal) {
      return
    }
    appReadPending = true
    void reader.read().then(
      (result) => {
        appReadPending = false
        if (!terminal) {
          if (result.done) {
            acceptAppRead(result)
          } else {
            settledAppRead = result
          }
          wakePump()
        }
      },
      (error) => {
        appReadPending = false
        if (!terminal) {
          handlePumpError(error)
        }
      },
    )
  }

  function acceptAppRead(result: NodeReadableStreamReadResult<AppStreamValue>) {
    if (result.done) {
      appDone = true
      insertionBoundary = closeCarry === undefined
      // The serialization deadline is a transport concern of this merge
      // path; the lifecycle signal below stays a plain notification.
      hydrationScripts.startSerializationTimeout(
        opts?.timeoutMs ?? DEFAULT_SERIALIZATION_TIMEOUT_MS,
      )
      serverSsr.setRenderFinished()
      return
    }
    const value = result.value
    if (typeof value === 'string') {
      if (value.length === 0) {
        return
      }
      appString = value
      appStringOffset = 0
      insertionBoundary = false
      loadNextAppStringChunk()
      return
    }
    if (value.byteLength === 0) {
      return
    }
    appBytes = value
    appOffset = 0
    insertionBoundary = false
  }

  async function loadNextAppChunk() {
    if (appString !== undefined) {
      loadNextAppStringChunk()
      return
    }
    if (settledAppRead) {
      const settled = settledAppRead
      settledAppRead = undefined
      acceptAppRead(settled)
      return
    }

    const scriptsCanInterruptRead =
      applicationPhase !== ApplicationPhase.BeforeBoundary &&
      insertionBoundary &&
      hydrationOutput.state !== HydrationScriptOutputState.Done
    if (!scriptsCanInterruptRead && !appReadPending) {
      const result = await reader.read()
      if (terminal) {
        return
      }
      acceptAppRead(result)
      return
    }

    const wake = waitForWake()
    startAppRead()
    await wake
  }

  async function pump() {
    while (!terminal) {
      if (applicationPhase === ApplicationPhase.PassThrough) {
        if (appBytes) {
          const remainder =
            appOffset === 0 ? appBytes : appBytes.subarray(appOffset)
          appBytes = undefined
          if (enqueueAppBytes(remainder)) {
            return
          }
          continue
        }
        if (appDone) {
          terminate('complete')
          return
        }
        await loadNextAppChunk()
        continue
      }

      const hydrationState = hydrationOutput.state
      if (hydrationState === HydrationScriptOutputState.Active) {
        controller.enqueue(hydrationOutput.pullChunk())
        return
      }
      if (
        applicationPhase !== ApplicationPhase.BeforeBoundary &&
        insertionBoundary &&
        hydrationState === HydrationScriptOutputState.Ready
      ) {
        if (!appDone && !appBytes && appString === undefined) {
          startAppRead()
        }
        controller.enqueue(hydrationOutput.pullChunk())
        return
      }
      if (
        applicationPhase === ApplicationPhase.Merge &&
        hydrationState === HydrationScriptOutputState.Done &&
        closeCarry === undefined &&
        hydrationScripts.reserveFastPath(hydrationOutput)
      ) {
        applicationPhase = ApplicationPhase.PassThrough
        stopHydrationOutputListener?.()
        stopHydrationOutputListener = undefined
        continue
      }
      if (appBytes) {
        if (processAppChunk()) {
          return
        }
        continue
      }

      if (appDone) {
        if (applicationPhase === ApplicationPhase.BeforeBoundary) {
          throw new Error(
            'SSR router scripts require a rendered <Scripts> boundary. ' +
              'Render <Scripts /> in <body>, or opt the request out of hydration with ' +
              'serverSsr.disableHydration().',
          )
        }
        if (closeCarry) {
          if (hydrationState === HydrationScriptOutputState.Waiting) {
            await waitForWake()
            continue
          }
          if (hydrationState === HydrationScriptOutputState.Ready) {
            throw new Error(
              'SSR app HTML ended with an incomplete document close',
            )
          }
          controller.enqueue(closeCarry)
          closeCarry = undefined
          terminate('complete')
          return
        }
        if (hydrationState === HydrationScriptOutputState.Waiting) {
          await waitForWake()
          continue
        }
        if (applicationPhase === ApplicationPhase.HeldClose) {
          controller.enqueue(DOCUMENT_CLOSE_BYTES.slice())
          terminate('complete')
          return
        }
        terminate('complete')
        return
      }

      await loadNextAppChunk()
    }
  }

  function handlePumpError(error: unknown) {
    if (terminal) {
      return
    }
    console.error('Error processing appStream:', error)
    terminate('failure', error)
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    pull() {
      return pump().catch(handlePumpError)
    },
    cancel(reason) {
      return terminate('cancel', reason)
    },
  })

  const stopOutputListener = hydrationOutput.subscribe(() => {
    if (hydrationOutput.state === HydrationScriptOutputState.Failed) {
      terminate('failure', hydrationOutput.error)
      return
    }
    wakePump()
  })
  stopHydrationOutputListener = stopOutputListener
  const disarmLifecycle = armStreamLifecycle(
    serverSsr,
    opts,
    () => terminal,
    terminate,
  )

  return stream
}
