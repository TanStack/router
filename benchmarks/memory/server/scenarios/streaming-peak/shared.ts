import {
  createDeterministicRandom,
  randomSegment,
  runSequentialRequestLoop,
} from '#memory-server/bench-utils'
import { deferredSectionCount, openSectionGate } from './stream-gate.ts'
import type { StartRequestHandler } from '#memory-server/bench-utils'

export type { StartRequestHandler }

type Framework = 'react' | 'solid' | 'vue'
type ChunkListener = (chunk: Uint8Array) => void

const benchmarkSeed = 0xdecafbad
const streamingPeakIterations = 1
const sanityDeadlineMs = 10_000

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

function streamId(random: () => number, index: number) {
  return `${index}-${randomSegment(random)}`
}

function buildStreamRequest(id: string) {
  return new Request(`http://localhost/stream/${id}`, requestInit)
}

function validateStreamingResponse(response: Response, request: Request) {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200 for ${request.url}, got ${response.status}`,
    )
  }
}

// Gate k opens once the markers of stage k have been read, in order: the
// shell's first fallback for section 0, then section k's markup for section
// k+1. Solid flushes each section's reveal script and resource data from a
// setTimeout, so its stages also wait for that script; otherwise the timer
// would race the next section and batch a varying number of sections.
function createGateSteps(framework: Framework) {
  const encoder = new TextEncoder()
  const sectionEnd = framework === 'solid' ? ['$df('] : []
  const stages = [
    ['streaming-peak-fallback-0'],
    ...Array.from({ length: deferredSectionCount - 1 }, (_, index) => [
      `streaming-peak-deferred-${index}`,
      ...sectionEnd,
    ]),
  ]

  return stages.flatMap((markers) =>
    markers.map((marker, index) => ({
      // Matching restarts at a mismatching byte, which is only correct while
      // a marker's first byte does not recur in it.
      marker: encoder.encode(marker),
      opensGate: index === markers.length - 1,
    })),
  )
}

// Setup only: scans the body for the stage markers and records after how many
// chunks each gate opened.
function createMarkerGateOpener(id: string, framework: Framework) {
  const steps = createGateSteps(framework)
  const gateChunkCounts: Array<number> = []
  let chunkCount = 0
  let step = 0
  let matched = 0

  const onChunk: ChunkListener = (chunk) => {
    chunkCount++

    for (let index = 0; index < chunk.length && step < steps.length; index++) {
      const { marker, opensGate } = steps[step]!
      const byte = chunk[index]

      if (byte === marker[matched]) {
        matched++
      } else {
        matched = byte === marker[0] ? 1 : 0
      }

      if (matched === marker.length) {
        step++
        matched = 0

        if (opensGate) {
          openSectionGate(id, gateChunkCounts.length)
          gateChunkCounts.push(chunkCount)
        }
      }
    }
  }

  return { onChunk, gateChunkCounts }
}

// Measured runs replay the recorded chunk counts, so the harness does no
// per-byte work (and no hot loop for V8 to optimize) inside the measurement.
function createCountedGateOpener(
  id: string,
  gateChunkCounts: ReadonlyArray<number>,
): ChunkListener {
  let chunkCount = 0
  let gate = 0

  return () => {
    chunkCount++

    if (chunkCount === gateChunkCounts[gate]) {
      openSectionGate(id, gate++)
    }
  }
}

async function readChunkSizes(
  handler: StartRequestHandler,
  id: string,
  onChunk: ChunkListener,
) {
  const request = buildStreamRequest(id)
  const response = await handler.fetch(request)

  validateStreamingResponse(response, request)

  const reader = response.body?.getReader()

  if (!reader) {
    throw new Error('Expected streaming response body')
  }

  const chunkSizes: Array<number> = []

  for (;;) {
    const result = await reader.read()

    if (result.done) {
      break
    }

    chunkSizes.push(result.value.byteLength)
    onChunk(result.value)
  }

  return chunkSizes
}

// A stage whose output never streams leaves its gate closed and the response
// hanging, so bound the setup-time reads.
async function readChunkSizesWithDeadline(
  handler: StartRequestHandler,
  id: string,
  onChunk: ChunkListener,
) {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      readChunkSizes(handler, id, onChunk),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `streaming-peak response did not complete within ${sanityDeadlineMs}ms`,
            ),
          )
        }, sanityDeadlineMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export function createWorkloadGroup(
  framework: Framework,
  handler: StartRequestHandler,
) {
  let gateChunkCounts: ReadonlyArray<number> | undefined
  // Requests are strictly sequential, so the response being read always
  // belongs to the request built last.
  let onChunk: ChunkListener = () => {}

  const sanity = async () => {
    // Same URL as the measured request, so the recorded counts apply to it.
    const id = streamId(createDeterministicRandom(benchmarkSeed), 0)
    // The first request also imports the route chunks. A completed response
    // proves the shell streamed before section 0 and each section after the
    // previous one.
    const scanned = createMarkerGateOpener(id, framework)
    const scannedSizes = await readChunkSizesWithDeadline(
      handler,
      id,
      scanned.onChunk,
    )
    // Measured runs inherit the warmup history, so replaying the counts on a
    // warm request must reproduce the cold chunking exactly.
    const replayedSizes = await readChunkSizesWithDeadline(
      handler,
      id,
      createCountedGateOpener(id, scanned.gateChunkCounts),
    )

    if (scannedSizes.join() !== replayedSizes.join()) {
      throw new Error(
        `Expected deterministic streaming-peak chunk sizes, got [${scannedSizes.join()}] then [${replayedSizes.join()}]`,
      )
    }

    gateChunkCounts = scanned.gateChunkCounts
  }

  const run = () => {
    const counts = gateChunkCounts

    if (!counts) {
      throw new Error('Run the streaming-peak sanity check before the workload')
    }

    return runSequentialRequestLoop(handler, {
      seed: benchmarkSeed,
      iterations: streamingPeakIterations,
      buildRequest: (random, index) => {
        const id = streamId(random, index)

        onChunk = createCountedGateOpener(id, counts)

        return buildStreamRequest(id)
      },
      validateResponse: validateStreamingResponse,
      onChunk: (chunk) => onChunk(chunk),
    })
  }

  return {
    sanity,
    workloads: [
      {
        name: `mem server streaming-peak chunked (${framework})`,
        run,
      },
    ],
  }
}
