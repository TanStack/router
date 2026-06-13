import { bench, describe } from 'vitest'
import {
  memoryBenchOptions,
  runSequentialRequestLoop,
} from '../../../bench-utils'
import type { StartRequestHandler } from '../../../bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const benchmarkSeed = 0x5eed_0005
const peakLargePageIterations = 2
const peakLargePageUrl = 'http://localhost/l1/l2/l3/l4/l5/l6/l7/l8'
const levelEightMarker = 'data-bench="peak-large-page-level-8"'
const knownDehydratedRecordName = 'peak-large-page-l8-record-199'

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

function buildPeakLargePageRequest() {
  return new Request(peakLargePageUrl, requestInit)
}

function validatePeakLargePageResponse(response: Response, request: Request) {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200 for ${request.url}, got ${response.status}`,
    )
  }
}

function validatePeakLargePageBody(body: string) {
  if (!body.includes(levelEightMarker)) {
    throw new Error('Expected peak-large-page level-8 marker in response body')
  }

  if (!body.includes(knownDehydratedRecordName)) {
    throw new Error(
      'Expected peak-large-page dehydrated record in response body',
    )
  }
}

async function assertPeakLargePageSanity(handler: StartRequestHandler) {
  const request = new Request(peakLargePageUrl, requestInit)
  const response = await handler.fetch(request)
  const body = await response.text()

  validatePeakLargePageResponse(response, request)
  validatePeakLargePageBody(body)
}

await assertPeakLargePageSanity(handler)

describe('memory', () => {
  bench(
    'mem peak-large-page (react)',
    () =>
      runSequentialRequestLoop(handler, {
        seed: benchmarkSeed,
        iterations: peakLargePageIterations,
        buildRequest: buildPeakLargePageRequest,
        validateResponse: validatePeakLargePageResponse,
      }),
    memoryBenchOptions,
  )
})
