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
      await settleAndPinGc()
    }
  }
}

// Renderer/stream teardown spans several event-loop turns (React and Vue
// need more than the two turns the original barrier allowed for), and a
// too-short settle window leaks a whole payload of garbage past the
// collection point, flipping the measured peak bimodally between runs.
// Every step here is a fixed count on purpose: an adaptive exit (collect
// until the post-GC heap size stops moving) makes the collection points
// land at data-dependent turns, which re-introduces exactly the run-to-run
// variance this barrier exists to remove — heap-size readings never fully
// stabilize under the instrumented CI environment, so the exit point (and
// with it every subsequent GC point) shifted between identical runs.
const settleTurnsBeforeGc = 16

// Settle trailing renderer/stream teardown with a fixed number of 0ms timer
// hops (one full event-loop turn each, microtasks flushing between hops),
// then pin a collection point. The second collection one turn later picks
// up whatever the first collection's finalizers released. gc() is present
// under CodSpeed (--expose-gc); in plain smoke runs there is nothing to
// pin, so only the settle hops run.
export async function settleAndPinGc() {
  for (let turn = 0; turn < settleTurnsBeforeGc; turn++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  const gc = (globalThis as { gc?: () => void }).gc

  if (gc) {
    gc()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    gc()
  }
}
