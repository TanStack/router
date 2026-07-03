export interface StartRequestHandler {
  fetch: (request: Request) => Promise<Response> | Response
}

type RunSequentialRequestLoopRandomOptions =
  | {
      seed: number
      random?: never
    }
  | {
      random: () => number
      seed?: never
    }

export type RunSequentialRequestLoopOptions =
  RunSequentialRequestLoopRandomOptions & {
    iterations?: number
    buildRequest: (random: () => number, index: number) => Request
    validateResponse?: (response: Response, request: Request) => void
    // Whether V8 collects iteration i's garbage before iteration i+1
    // allocates its payload is not reproducible run to run — the measured
    // peak flips by a whole payload depending on GC timing, which shifts
    // with runner hardware. Forcing a collection between iterations pins
    // the GC points so peak deterministically measures the largest
    // single-iteration footprint plus any reachable accumulation.
    // Accumulation signals stay visible: leaked or cached objects are
    // still referenced, so a forced collection cannot reclaim them — it
    // only removes floating garbage, whose collection timing is the
    // dominant cross-run noise source.
    pinGcBetweenIterations?: boolean
  }

export const memoryBenchOptions = {
  iterations: 1,
  warmupIterations: 1,
  time: 0,
  warmupTime: 0,
  throws: true,
}

export function createDeterministicRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

export function randomSegment(random: () => number) {
  return Math.floor(random() * 1_000_000_000).toString(36)
}

export async function drainResponse(response: Response) {
  const reader = response.body?.getReader()

  if (!reader) {
    return
  }

  try {
    while (true) {
      const result = await reader.read()

      if (result.done) {
        break
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function runSequentialRequestLoop(
  handler: StartRequestHandler,
  options: RunSequentialRequestLoopOptions,
) {
  const {
    iterations = 10,
    buildRequest,
    validateResponse,
    pinGcBetweenIterations = false,
  } = options
  const random =
    options.seed !== undefined
      ? createDeterministicRandom(options.seed)
      : options.random
  const validate =
    validateResponse ??
    ((response: Response, request: Request) => {
      if (response.status !== 200) {
        throw new Error(
          `Request failed with non-200 status ${response.status} (${request.url})`,
        )
      }
    })

  for (let index = 0; index < iterations; index++) {
    const request = buildRequest(random, index)
    const response = await handler.fetch(request)

    validate(response, request)

    await drainResponse(response)

    if (pinGcBetweenIterations) {
      // 8 turns minimum: React's post-request stream teardown spans several
      // event-loop turns, and a shorter floor lets it race the collection
      // point on some runs (heap size reads stable one turn too early).
      await settleAndPinGc(8)
    }
  }
}

// Settle trailing renderer/stream teardown, then pin a collection point.
// gc() is present under CodSpeed (--expose-gc); in plain smoke runs there is
// nothing to pin, so fall back to `minTicks` 0ms timer hops that still let
// teardown scheduled for the next turns run between iterations.
export async function settleAndPinGc(minTicks: number) {
  const gc = (globalThis as { gc?: () => void }).gc

  if (gc) {
    await settlePinnedGc(gc, minTicks)
    return
  }

  for (let tick = 0; tick < minTicks; tick++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

const maxGcSettleTurns = 16

// A fixed number of settle turns before the pinned collection is
// hardware-fragile: teardown that needs one more event-loop turn on a given
// runner leaks a whole payload of garbage past the collection point and
// flips the measured peak bimodally. Hop one full event-loop turn and
// collect until the post-collection heap size stops moving (two identical
// consecutive readings), bounded so a drifting heap cannot stall the run —
// an unsettled exit then just means one iteration measures like the
// fixed-turn barrier did. Heap-size stability alone can read as quiescent
// one turn before teardown scheduled on later timers has run (React's
// post-abort teardown spans several turns), so never exit before the
// scenario's proven fixed turn count either — the barrier must settle
// strictly more than the fixed-count barrier it replaced, never less.
async function settlePinnedGc(gc: () => void, minTurns: number) {
  let previousHeapUsed = -1

  for (let turn = 0; turn < maxGcSettleTurns; turn++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    gc()

    const { heapUsed } = process.memoryUsage()

    if (heapUsed === previousHeapUsed && turn + 1 >= minTurns) {
      return
    }

    previousHeapUsed = heapUsed
  }
}
