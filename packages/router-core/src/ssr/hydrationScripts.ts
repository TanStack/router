/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="../vite-env.d.ts" />

import { getCrossReferenceHeader } from 'seroval'
import { invariant } from '../invariant'
import minifiedTsrBootStrapScript from './tsrScript?script-string'
import { GLOBAL_TSR } from './constants'
import type { RouterManagedTag } from '../manifest'

export const SSR_SERIALIZATION_SCOPE_ID = 'tsr'
const HYDRATION_SCRIPT_BOUNDARY_TAIL = ';/*$tsr-stream-boundary*/'

const encoder = new TextEncoder()
const SOURCE_SEPARATOR = ';'
const MAX_INITIAL_SOURCE_CODE_UNITS = 16 * 1024
const MAX_BACKLOG_CODE_UNITS = 16 * 1024 * 1024
const MAX_BACKLOG_SOURCES = 4_096
const MIN_OUTPUT_BYTES = 256
const MAX_DIRECT_CODE_UNITS = 16 * 1024
export const MAX_HYDRATION_OUTPUT_CHUNK_BYTES = 64 * 1024
const MAX_DYNAMIC_RECORD_CODE_UNITS = MAX_HYDRATION_OUTPUT_CHUNK_BYTES

const STREAM_PART_ATTRIBUTE = 'data-tsr-stream-part'
const INITIAL_CLEANUP_SOURCE = `{let s=document.currentScript,p;while((p=s.previousElementSibling)&&p.hasAttribute('${STREAM_PART_ATTRIBUTE}'))p.remove();s.remove()}`
const INITIAL_CLEANUP_SUFFIX = SOURCE_SEPARATOR + INITIAL_CLEANUP_SOURCE
const DYNAMIC_CLOSE_SOURCE = 'document.currentScript.remove()</script>'
export const HYDRATION_SCRIPT_BOUNDARY_SOURCE =
  `document.currentScript.remove()` + HYDRATION_SCRIPT_BOUNDARY_TAIL
export const HYDRATION_SCRIPT_BOUNDARY_SUFFIX =
  HYDRATION_SCRIPT_BOUNDARY_TAIL + '</script>'
export const HYDRATION_SCRIPT_BOUNDARY_ANCHOR_INDEX =
  HYDRATION_SCRIPT_BOUNDARY_SUFFIX.lastIndexOf('*')
export const HYDRATION_SCRIPT_BOUNDARY_BYTES = encoder.encode(
  HYDRATION_SCRIPT_BOUNDARY_SUFFIX,
)

const ROUTER_PREFIX = GLOBAL_TSR + '.router='
const PROMISE_PREFIX = GLOBAL_TSR + '.p(()=>'
const DEFAULT_INITIAL_SOURCES = [
  getCrossReferenceHeader(SSR_SERIALIZATION_SCOPE_ID),
  minifiedTsrBootStrapScript,
]

export const HydrationScriptOutputState = {
  Waiting: 0,
  Ready: 1,
  Active: 2,
  Done: 3,
  Failed: 4,
} as const

export type HydrationScriptOutputState =
  (typeof HydrationScriptOutputState)[keyof typeof HydrationScriptOutputState]

/** A request-local, single-consumer stream of complete records. */
export type HydrationScriptOutput = {
  readonly state: HydrationScriptOutputState
  readonly error: unknown
  pullChunk: () => Uint8Array
  subscribe: (onChange: () => void) => () => void
}

type ConsumerOwnership =
  | HydrationScriptOutput
  | 'fast-path'
  | 'cleaned'
  | undefined

/** The one-time initial `<Scripts>` take: hydration tags plus the boundary. */
export type InitialHydrationScriptTags = {
  before: Array<RouterManagedTag>
  boundary: RouterManagedTag
}

function escapeAttribute(value: string) {
  return value.replace(/[&"'<>]/g, (char) => `&#${char.charCodeAt(0)};`)
}

function createInitialTags(
  sources: ReadonlyArray<string>,
  nonce: string | undefined,
): InitialHydrationScriptTags {
  const before: Array<RouterManagedTag> = []
  for (const source of sources) {
    if (!source) {
      continue
    }
    const previous = before[before.length - 1]
    if (
      previous?.children &&
      previous.children.length + SOURCE_SEPARATOR.length + source.length <=
        MAX_INITIAL_SOURCE_CODE_UNITS
    ) {
      previous.children += SOURCE_SEPARATOR + source
    } else {
      before.push({
        tag: 'script',
        attrs: { nonce, [STREAM_PART_ATTRIBUTE]: '' },
        children: source,
      })
    }
  }
  // Cleanup runs before route and asset scripts. If hydration code fails, its
  // transport tags can remain because that page cannot hydrate successfully.
  const lastHydrationTag = before[before.length - 1]
  if (lastHydrationTag) {
    const lastSource = lastHydrationTag.children!
    if (
      lastSource.length + INITIAL_CLEANUP_SUFFIX.length <=
      MAX_INITIAL_SOURCE_CODE_UNITS
    ) {
      lastHydrationTag.children = lastSource + INITIAL_CLEANUP_SUFFIX
    } else {
      // Do not concatenate onto a large source. A renderer could flatten the
      // result and temporarily retain a second copy of the hydration payload.
      before.push({
        tag: 'script',
        attrs: { nonce, [STREAM_PART_ATTRIBUTE]: '' },
        children: INITIAL_CLEANUP_SOURCE,
      })
    }
  }
  return {
    before,
    boundary: {
      tag: 'script',
      attrs: { nonce },
      children: HYDRATION_SCRIPT_BOUNDARY_SOURCE,
    } satisfies RouterManagedTag,
  }
}

/** Create the hydration-script owner for one server request. */
export function createHydrationScripts(
  nonce: string | undefined,
  initialSources?: ReadonlyArray<string>,
) {
  const seedSources = initialSources ?? DEFAULT_INITIAL_SOURCES
  let queuedSources: Array<string | undefined> = []
  let queuedSourceHead = 0
  let initialTaken = false
  let barrierLifted = false
  let producerDone = false
  let consumer: ConsumerOwnership
  let listener: (() => void) | undefined

  let active: Array<string | undefined> | undefined
  let retainedSources = 0
  let regularCodeUnits = 0
  let hasOversizedSource = false

  let segmentIndex = 0
  let closingSegmentIndex = 0
  let source = ''
  let sourceOffset = 0
  let outputCapacity = MIN_OUTPUT_BYTES

  let state: HydrationScriptOutputState = HydrationScriptOutputState.Waiting
  let error: unknown
  let timeout: ReturnType<typeof setTimeout> | undefined

  let opening: string | undefined

  function notify() {
    try {
      listener?.()
    } catch (listenerError) {
      console.error('Hydration script output listener error:', listenerError)
    }
  }

  function refresh(notifyChange = true) {
    const next =
      state === HydrationScriptOutputState.Failed
        ? HydrationScriptOutputState.Failed
        : active
          ? HydrationScriptOutputState.Active
          : typeof consumer === 'object' &&
              initialTaken &&
              barrierLifted &&
              !queueIsEmpty()
            ? HydrationScriptOutputState.Ready
            : producerDone && initialTaken && queueIsEmpty()
              ? HydrationScriptOutputState.Done
              : HydrationScriptOutputState.Waiting
    if (state !== next) {
      state = next
      if (notifyChange) {
        notify()
      }
    }
  }

  function clearTimeoutIfSet() {
    if (timeout !== undefined) {
      clearTimeout(timeout)
      timeout = undefined
    }
  }

  function queueIsEmpty() {
    return queuedSourceHead === queuedSources.length
  }

  function clearQueue() {
    queuedSources = []
    queuedSourceHead = 0
  }

  function dropBufferedOutput() {
    clearQueue()
    active = undefined
    retainedSources = 0
    regularCodeUnits = 0
    hasOversizedSource = false
    segmentIndex = 0
    closingSegmentIndex = 0
    source = ''
    sourceOffset = 0
    outputCapacity = MIN_OUTPUT_BYTES
    opening = undefined
  }

  function fail(reason: unknown) {
    if (consumer === 'cleaned' || state === HydrationScriptOutputState.Failed) {
      return
    }
    error = reason
    clearTimeoutIfSet()
    dropBufferedOutput()
    state = HydrationScriptOutputState.Failed
    notify()
  }

  function rejectBacklog(kind: 'source-part' | 'code-unit') {
    fail(new Error(`SSR hydration backlog exceeded maximum ${kind} count`))
    return false
  }

  function account(nextSource: string) {
    if (retainedSources === MAX_BACKLOG_SOURCES) {
      return rejectBacklog('source-part')
    }
    if (nextSource.length > MAX_BACKLOG_CODE_UNITS) {
      if (hasOversizedSource) {
        return rejectBacklog('code-unit')
      }
      hasOversizedSource = true
    } else if (regularCodeUnits + nextSource.length > MAX_BACKLOG_CODE_UNITS) {
      return rejectBacklog('code-unit')
    } else {
      regularCodeUnits += nextSource.length
    }
    retainedSources++
    return true
  }

  function releaseSource(part: string) {
    retainedSources--
    if (part.length > MAX_BACKLOG_CODE_UNITS) {
      hasOversizedSource = false
    } else {
      regularCodeUnits -= part.length
    }
  }

  function releaseAccounting(batch: ReadonlyArray<string | undefined>) {
    for (const part of batch) {
      if (part !== undefined) {
        releaseSource(part)
      }
    }
  }

  function liftBarrier() {
    if (consumer !== 'cleaned' && !barrierLifted) {
      barrierLifted = true
      refresh()
    }
  }

  function producerCanWrite() {
    return (
      consumer !== 'cleaned' &&
      state !== HydrationScriptOutputState.Failed &&
      !producerDone
    )
  }

  function pushSource(nextSource: string) {
    if (!producerCanWrite()) {
      return false
    }
    if (account(nextSource)) {
      queuedSources.push(nextSource)
      if (initialTaken) {
        refresh()
      }
    } else {
      return false
    }
    // A notification can synchronously fail or clean up this owner.
    return producerCanWrite()
  }

  function takeQueuedBatch(batchLength: number) {
    if (queuedSourceHead === 0 && batchLength === queuedSources.length) {
      const batch = queuedSources
      clearQueue()
      return batch
    }
    const end = queuedSourceHead + batchLength
    const batch = queuedSources.slice(queuedSourceHead, end)
    for (let index = queuedSourceHead; index < end; index++) {
      queuedSources[index] = undefined
    }
    queuedSourceHead = end
    if (queueIsEmpty()) {
      clearQueue()
    } else if (
      queuedSourceHead >= 1024 &&
      queuedSourceHead >= queuedSources.length - queuedSourceHead
    ) {
      queuedSources = queuedSources.slice(queuedSourceHead)
      queuedSourceHead = 0
    }
    return batch
  }

  function release(batch: Array<string | undefined>) {
    releaseAccounting(batch)
    active = undefined
    source = ''
    sourceOffset = 0
    refresh(false)
  }

  function advanceSource() {
    const batch = active!
    if (segmentIndex > 0 && segmentIndex < closingSegmentIndex) {
      const partIndex = (segmentIndex - 1) >> 1
      if (segmentIndex % 2 === 1) {
        const part = batch[partIndex]
        if (part !== undefined) {
          releaseSource(part)
          batch[partIndex] = undefined
        }
      }
    }
    segmentIndex++
    // Segment 0 is the opening tag. Sources and separators alternate until
    // the closing segment. The next advance releases the complete record.
    if (segmentIndex < closingSegmentIndex) {
      const partIndex = (segmentIndex - 1) >> 1
      source = segmentIndex % 2 === 1 ? batch[partIndex]! : SOURCE_SEPARATOR
    } else if (segmentIndex === closingSegmentIndex) {
      source = DYNAMIC_CLOSE_SOURCE
    } else {
      release(batch)
    }
    sourceOffset = 0
  }

  function pullActive() {
    const bytes = new Uint8Array(outputCapacity)
    let offset = 0
    while (active) {
      if (sourceOffset === source.length) {
        advanceSource()
      } else if (offset === bytes.length) {
        break
      } else {
        const target = offset === 0 ? bytes : bytes.subarray(offset)
        const result = encoder.encodeInto(source.slice(sourceOffset), target)
        if (result.read === 0) {
          break
        }
        sourceOffset += result.read
        offset += result.written
      }
    }
    if (offset === 0) {
      throw new Error('SSR router script record produced no output')
    }
    if (offset === bytes.length) {
      return bytes
    }
    // A subarray view pins the whole output buffer. Copy mostly-empty tail
    // chunks (typically the final close-tag remnant) so the large buffer can
    // be collected immediately.
    return offset * 2 < bytes.length
      ? bytes.slice(0, offset)
      : bytes.subarray(0, offset)
  }

  function pullReady() {
    const scriptOpening = (opening ??= nonce
      ? `<script nonce="${escapeAttribute(nonce)}">`
      : '<script>')
    let codeUnits = scriptOpening.length + DYNAMIC_CLOSE_SOURCE.length
    let batchLength = 0
    for (let index = queuedSourceHead; index < queuedSources.length; index++) {
      const part = queuedSources[index]!
      const nextCodeUnits = codeUnits + SOURCE_SEPARATOR.length + part.length
      if (batchLength > 0 && nextCodeUnits > MAX_DYNAMIC_RECORD_CODE_UNITS) {
        break
      }
      codeUnits = nextCodeUnits
      batchLength++
      if (codeUnits > MAX_DYNAMIC_RECORD_CODE_UNITS) {
        // A complete JavaScript source is not safely splittable across tags.
        break
      }
    }
    const batch = takeQueuedBatch(batchLength)
    if (codeUnits <= MAX_DIRECT_CODE_UNITS) {
      const joined =
        batch.length === 1 ? batch[0]! : batch.join(SOURCE_SEPARATOR)
      const bytes = encoder.encode(
        scriptOpening + joined + SOURCE_SEPARATOR + DYNAMIC_CLOSE_SOURCE,
      )
      release(batch)
      return bytes
    }
    active = batch
    segmentIndex = 0
    closingSegmentIndex = (batch.length << 1) + 1
    source = scriptOpening
    sourceOffset = 0
    outputCapacity = Math.max(
      MIN_OUTPUT_BYTES,
      Math.min(MAX_HYDRATION_OUTPUT_CHUNK_BYTES, codeUnits),
    )
    state = HydrationScriptOutputState.Active
    return pullActive()
  }

  function pullChunk() {
    if (
      state !== HydrationScriptOutputState.Ready &&
      state !== HydrationScriptOutputState.Active
    ) {
      throw new Error('Hydration script output is not ready')
    }
    try {
      return state === HydrationScriptOutputState.Ready
        ? pullReady()
        : pullActive()
    } catch (cause) {
      fail(cause)
      throw cause
    }
  }

  function cleanup() {
    if (consumer === 'cleaned') {
      return
    }
    consumer = 'cleaned'
    clearTimeoutIfSet()
    dropBufferedOutput()
    listener = undefined
    error = undefined
    producerDone = true
    state = HydrationScriptOutputState.Done
  }

  for (const seedSource of seedSources) {
    if (!account(seedSource)) {
      break
    }
    queuedSources.push(seedSource)
  }

  return {
    pushSerializedSource(data: string, initial: boolean, wrap: boolean) {
      let serialized = initial ? ROUTER_PREFIX + data : data
      if (wrap) {
        serialized = PROMISE_PREFIX + serialized + ')'
      }
      return pushSource(serialized)
    },
    pushSource,
    fail,
    finish() {
      if (!pushSource(GLOBAL_TSR + '.e()')) {
        return
      }
      producerDone = true
      clearTimeoutIfSet()
      refresh()
    },
    takeInitialHydrationScriptTags() {
      if (
        consumer === 'cleaned' ||
        state === HydrationScriptOutputState.Failed ||
        initialTaken
      ) {
        return undefined
      }
      // No source can drain before the initial take, so the queue has no
      // cleared prefix and ownership can transfer without copying the array.
      const sources = queuedSources as Array<string>
      const tags = createInitialTags(sources, nonce)
      clearQueue()
      initialTaken = true
      releaseAccounting(sources)
      refresh()
      return tags
    },
    /**
     * Opt this request out of hydration output entirely (for example a
     * `hydrate: false` page). Drops the queued bootstrap sources, marks the
     * producer done, and makes the fast pass-through path reservable without
     * a rendered `<Scripts>` boundary. Must run before the initial take and
     * before serialization produces output.
     */
    disableHydration() {
      if (
        consumer === 'cleaned' ||
        state === HydrationScriptOutputState.Failed
      ) {
        return
      }
      if (initialTaken || consumer !== undefined || producerDone || active) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            'Invariant failed: hydration output is already committed; ' +
              'disableHydration() must run before <Scripts> renders and ' +
              'before serialization starts.',
          )
        }

        invariant()
      }
      releaseAccounting(queuedSources)
      clearQueue()
      initialTaken = true
      barrierLifted = true
      producerDone = true
      refresh()
    },
    // The rendered boundary can only exist after the initial take. The merger
    // uses this to skip barrier scanning for all earlier renderer bytes.
    isInitialTaken() {
      return initialTaken
    },
    liftBarrier,
    claimOutput() {
      if (consumer === 'cleaned') {
        throw new Error('SSR hydration script output is already cleaned up')
      }
      if (consumer !== undefined) {
        throw new Error('SSR hydration script output already has a consumer')
      }
      const output: HydrationScriptOutput = {
        get state() {
          return state
        },
        get error() {
          return error
        },
        pullChunk,
        subscribe(onChange) {
          if (consumer === 'cleaned') {
            return () => {}
          }
          if (listener) {
            throw new Error('SSR hydration output already has a subscriber')
          }
          listener = onChange
          return () => {
            if (listener === onChange) {
              listener = undefined
            }
          }
        },
      }
      consumer = output
      refresh(false)
      return output
    },
    reserveFastPath(output?: HydrationScriptOutput) {
      const ownsConsumer = consumer === output
      if (
        state === HydrationScriptOutputState.Failed ||
        !producerDone ||
        !initialTaken ||
        !queueIsEmpty() ||
        active ||
        !ownsConsumer
      ) {
        return false
      }
      consumer = 'fast-path'
      return true
    },
    // Arms the serialization deadline once the renderer finished. The
    // lifecycle signal stays separate from this merge-transport concern.
    startSerializationTimeout(timeoutMs: number) {
      if (
        consumer === 'cleaned' ||
        state === HydrationScriptOutputState.Failed ||
        producerDone ||
        timeout !== undefined
      ) {
        return
      }
      timeout = setTimeout(() => {
        timeout = undefined
        if (
          consumer !== 'cleaned' &&
          state !== HydrationScriptOutputState.Failed &&
          !producerDone
        ) {
          console.error('Serialization timeout after app render finished')
          fail(new Error('Serialization timeout after app render finished'))
        }
      }, timeoutMs)
    },
    cleanup,
  }
}
