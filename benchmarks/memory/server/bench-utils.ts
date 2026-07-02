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
    // For peak-shape scenarios only. Their signal is the footprint of a
    // single request, but whether V8 collects iteration i's garbage before
    // iteration i+1 allocates its payload is not reproducible run to run —
    // the measured peak flips by a whole payload depending on GC timing.
    // Forcing a collection between iterations pins the GC points so peak
    // deterministically measures max(single-request footprint). Churn
    // scenarios must never set this: their signal is accumulation across
    // iterations, which a forced GC would mask.
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
      // Two 0ms timer hops first, so trailing renderer/stream teardown
      // scheduled for the next turns runs before the collection — otherwise
      // its garbage survives into the next iteration's measurements.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      // Present under CodSpeed (--expose-gc); absent in plain smoke runs.
      ;(globalThis as { gc?: () => void }).gc?.()
    }
  }
}
