import {
  randomSegment,
  runSequentialRequestLoop,
} from '#memory-server/bench-utils'
import {
  fillRawStreamChunk,
  rawStreamChunkBytes,
  rawStreamChunkCount,
  rawStreamPeakMarker,
} from './raw-stream-payload'
import type { StartRequestHandler } from '#memory-server/bench-utils'

export type { StartRequestHandler }

type Framework = 'react' | 'solid' | 'vue'

const benchmarkSeed = 0x5eed_0008
const rawStreamPeakIterations = 1
const pageMarker = `data-bench="${rawStreamPeakMarker}"`

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

function buildRawStreamRequest(random: () => number, index: number) {
  return new Request(
    `http://localhost/raw/${index}-${randomSegment(random)}`,
    requestInit,
  )
}

function validateRawStreamResponse(response: Response, request: Request) {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200 for ${request.url}, got ${response.status}`,
    )
  }
}

/** The base64 text the SSR plugin emits for one chunk of the stream. */
function encodedChunk(id: string, chunkIndex: number) {
  return Buffer.from(
    fillRawStreamChunk(new Uint8Array(rawStreamChunkBytes), id, chunkIndex),
  ).toString('base64')
}

async function assertRawStreamPeakSanity(handler: StartRequestHandler) {
  const id = 'sanity'
  const request = new Request(`http://localhost/raw/${id}`, requestInit)
  const response = await handler.fetch(request)

  validateRawStreamResponse(response, request)

  const body = await response.text()

  if (!body.includes(pageMarker)) {
    throw new Error('Expected raw-stream-peak marker in response body')
  }

  // The stream must reach the document through SSR hydration scripts, from
  // its first chunk to its last.
  for (const chunkIndex of [0, rawStreamChunkCount - 1]) {
    if (!body.includes(encodedChunk(id, chunkIndex))) {
      throw new Error(
        `Expected encoded RawStream chunk ${chunkIndex} in response body`,
      )
    }
  }
}

export function createWorkloadGroup(
  framework: Framework,
  handler: StartRequestHandler,
) {
  const run = async () =>
    runSequentialRequestLoop(handler, {
      seed: benchmarkSeed,
      iterations: rawStreamPeakIterations,
      buildRequest: buildRawStreamRequest,
      validateResponse: validateRawStreamResponse,
    })

  return {
    sanity: () => assertRawStreamPeakSanity(handler),
    workloads: [
      {
        name: `mem server raw-stream-peak (${framework})`,
        run,
      },
    ],
  }
}
