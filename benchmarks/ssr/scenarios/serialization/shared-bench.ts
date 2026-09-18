import { benchPointAdapterKey, richDateIso } from './shared-data'
import {
  findDehydrationMarkerIndex,
  randomSegment,
  runRequestLoop,
} from '../../bench-utils'
import type { StartRequestHandler } from '../../bench-utils'

export type { StartRequestHandler }

const benchmarkSeed = 0xdecafbad
const richSerializationLoopTotalRequests = 32
const plainSerializationLoopTotalRequests = 32

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

function buildSerializationRequest(
  route: 'plain' | 'rich',
  random: () => number,
  index: number,
) {
  const suffix = index.toString(36)
  const id = `${randomSegment(random)}-${suffix}`

  return new Request(`http://localhost/${route}/${id}`, requestInit)
}

async function fetchScenarioBody(
  handler: StartRequestHandler,
  route: 'plain' | 'rich',
) {
  const response = await handler.fetch(
    new Request(`http://localhost/${route}/sanity`, requestInit),
  )
  const body = await response.text()

  if (response.status !== 200) {
    throw new Error(
      `Expected ${route} sanity request status 200, received ${response.status}: ${body}`,
    )
  }

  if (findDehydrationMarkerIndex(body) === -1) {
    throw new Error(`Expected ${route} response to include dehydration marker`)
  }

  return body
}

function assertIncludes(body: string, marker: string, label: string) {
  if (!body.includes(marker)) {
    throw new Error(`Expected ${label} response to include ${marker}`)
  }
}

function assertExcludes(body: string, marker: string, label: string) {
  if (body.includes(marker)) {
    throw new Error(`Expected ${label} response not to include ${marker}`)
  }
}

// Typed values leave different artifacts per dehydration channel: the
// `$_TSR` script channel emits reconstruction code (`new Date(...)`), while
// Solid's `__TSR_P` JSON records carry seroval node tags (Date is node type
// 5, Map is 8) and route Errors through the `$TSR/Error` adapter.
const scriptChannelTypedMarkers = ['new Date', 'new Map', 'new Error']
const jsonChannelTypedMarkers = ['"t":5', '"t":8', '$TSR/Error']

export async function assertSerializationScenario(
  handler: StartRequestHandler,
) {
  const richBody = await fetchScenarioBody(handler, 'rich')
  const plainBody = await fetchScenarioBody(handler, 'plain')
  const typedMarkers = richBody.includes('__TSR_P')
    ? jsonChannelTypedMarkers
    : scriptChannelTypedMarkers

  assertIncludes(richBody, 'rich-sanity', 'rich')
  assertIncludes(richBody, benchPointAdapterKey, 'rich')
  assertIncludes(richBody, richDateIso, 'rich')
  for (const marker of typedMarkers) {
    assertIncludes(richBody, marker, 'rich')
  }

  assertIncludes(plainBody, 'plain-sanity', 'plain')
  assertExcludes(plainBody, benchPointAdapterKey, 'plain')
  for (const marker of [
    ...scriptChannelTypedMarkers,
    ...jsonChannelTypedMarkers,
  ]) {
    assertExcludes(plainBody, marker, 'plain')
  }
}

export const serializationBenchOptions = {
  warmupIterations: 100,
  time: 10_000,
  throws: true,
}

export function runRichSerializationLoop(handler: StartRequestHandler) {
  return runRequestLoop(handler, {
    seed: benchmarkSeed,
    concurrency: 16,
    totalRequests: richSerializationLoopTotalRequests,
    buildRequest: (random, index) =>
      buildSerializationRequest('rich', random, index),
  })
}

export function runPlainSerializationLoop(handler: StartRequestHandler) {
  return runRequestLoop(handler, {
    seed: benchmarkSeed,
    concurrency: 16,
    totalRequests: plainSerializationLoopTotalRequests,
    buildRequest: (random, index) =>
      buildSerializationRequest('plain', random, index),
  })
}
