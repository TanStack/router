import { bench, describe } from 'vitest'
import {
  memoryBenchOptions,
  randomSegment,
  runSequentialRequestLoop,
} from '../../../bench-utils'
import type { StartRequestHandler } from '../../../bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const benchmarkSeed = 0xdecafbad
const streamingPeakIterations = 3
const fallbackMarkers = [
  'streaming-peak-fallback-0',
  'streaming-peak-fallback-1',
  'streaming-peak-fallback-2',
  'streaming-peak-fallback-3',
] as const
const deferredSectionMarkers = [
  'streaming-peak-deferred-0',
  'streaming-peak-deferred-1',
  'streaming-peak-deferred-2',
  'streaming-peak-deferred-3',
] as const

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}

function buildStreamingRequest(random: () => number, index: number) {
  return new Request(
    `http://localhost/stream/${index}-${randomSegment(random)}`,
    requestInit,
  )
}

function validateStreamingResponse(response: Response, request: Request) {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200 for ${request.url}, got ${response.status}`,
    )
  }
}

function getResponseReader(response: Response) {
  const reader = response.body?.getReader()

  if (!reader) {
    throw new Error('Expected streaming response body')
  }

  return reader
}

async function readStreamingBody(response: Response) {
  const reader = getResponseReader(response)
  const decoder = new TextDecoder()
  let body = ''
  let chunkCount = 0

  while (true) {
    const result = await reader.read()

    if (result.done) {
      break
    }

    chunkCount++
    body += decoder.decode(result.value, { stream: true })
  }

  body += decoder.decode()

  return { body, chunkCount }
}

function assertFallbacksPrecedeDeferredContent(body: string) {
  for (let index = 0; index < fallbackMarkers.length; index++) {
    const fallbackIndex = body.indexOf(fallbackMarkers[index]!)
    const deferredIndex = body.indexOf(deferredSectionMarkers[index]!)

    if (fallbackIndex === -1) {
      throw new Error(
        `Expected fallback marker ${fallbackMarkers[index]} in body`,
      )
    }

    if (deferredIndex === -1) {
      throw new Error(
        `Expected deferred section marker ${deferredSectionMarkers[index]} in body`,
      )
    }

    if (fallbackIndex > deferredIndex) {
      throw new Error(
        `Expected ${fallbackMarkers[index]} to precede ${deferredSectionMarkers[index]}`,
      )
    }
  }
}

async function assertStreamingPeakSanity(handler: StartRequestHandler) {
  const chunkedRequest = new Request(
    'http://localhost/stream/sanity-chunked',
    requestInit,
  )
  const chunkedResponse = await handler.fetch(chunkedRequest)

  validateStreamingResponse(chunkedResponse, chunkedRequest)

  const chunked = await readStreamingBody(chunkedResponse)

  if (chunked.chunkCount <= 1) {
    throw new Error(
      `Expected chunked sanity response to produce multiple chunks, got ${chunked.chunkCount}`,
    )
  }

  assertFallbacksPrecedeDeferredContent(chunked.body)
}

await assertStreamingPeakSanity(handler)

describe('memory', () => {
  bench(
    'mem streaming-peak chunked (react)',
    async () => {
      await runSequentialRequestLoop(handler, {
        seed: benchmarkSeed,
        iterations: streamingPeakIterations,
        buildRequest: buildStreamingRequest,
        validateResponse: validateStreamingResponse,
      })
    },
    memoryBenchOptions,
  )
})
