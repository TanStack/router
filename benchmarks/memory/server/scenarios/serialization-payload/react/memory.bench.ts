import { bench, describe } from 'vitest'
import {
  memoryBenchOptions,
  randomSegment,
  runSequentialRequestLoop,
} from '../../../bench-utils'
import type { StartRequestHandler } from '../../../bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const benchmarkSeed = 0x51eaa11
const serializationPayloadIterations = 5
const payloadPageMarker = 'data-bench="serialization-payload"'
const dehydrationMarker = '$_TSR'

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

function buildPayloadRequest(random: () => number, index: number) {
  const id = `payload-${index}-${randomSegment(random)}`

  return new Request(`http://localhost/data/${id}`, requestInit)
}

function knownMapKey(id: string) {
  return `map-${id}-000`
}

function getRequestId(request: Request) {
  const url = new URL(request.url)
  const match = /^\/data\/([^/]+)$/.exec(url.pathname)
  const id = match?.[1]

  if (id === undefined) {
    throw new Error(`Expected /data/$id request URL, got ${request.url}`)
  }

  return decodeURIComponent(id)
}

function validatePayloadResponse(response: Response, request: Request) {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200 for ${request.url}, got ${response.status}`,
    )
  }
}

function validatePayloadBody(
  body: string,
  _response: Response,
  request: Request,
) {
  if (!body.includes(payloadPageMarker)) {
    throw new Error('Expected serialization-payload marker in response body')
  }

  if (!body.includes(dehydrationMarker)) {
    throw new Error('Expected serialization-payload dehydration script in body')
  }

  const mapKey = knownMapKey(getRequestId(request))

  if (!body.includes(mapKey)) {
    throw new Error(`Expected dehydrated payload to include Map key ${mapKey}`)
  }
}

async function assertSerializationPayloadSanity(handler: StartRequestHandler) {
  const request = new Request(
    'http://localhost/data/sanity-payload',
    requestInit,
  )
  const response = await handler.fetch(request)
  const body = await response.text()

  validatePayloadResponse(response, request)
  validatePayloadBody(body, response, request)
}

await assertSerializationPayloadSanity(handler)

describe('memory', () => {
  bench(
    'mem serialization-payload (react)',
    () =>
      runSequentialRequestLoop(handler, {
        seed: benchmarkSeed,
        iterations: serializationPayloadIterations,
        buildRequest: buildPayloadRequest,
        validateResponse: validatePayloadResponse,
        validateBody: validatePayloadBody,
      }),
    memoryBenchOptions,
  )
})
