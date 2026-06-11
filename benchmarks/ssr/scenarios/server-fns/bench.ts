import { toJSONAsync } from 'seroval'
import {
  createDeterministicRandom,
  randomSegment,
  runRequestLoop,
} from '../../bench-utils'
import type { StartRequestHandler } from '../../bench-utils'

export type { StartRequestHandler }

type Payload = {
  q: string
  n: number
  nested: { list: Array<string> }
}

type FnUrls = {
  get: string
  post: string
}

export type ServerFnBenchContext = {
  urls: FnUrls
  bodies: Array<string>
  getQueries: Array<string>
  expectedMarker: string
}

const benchmarkSeed = 0xdecafbad
const origin = 'http://localhost'
const tssContentTypeFramed = 'application/x-tss-framed'
const xTssSerialized = 'x-tss-serialized'
const acceptHeader = `${tssContentTypeFramed}, application/x-ndjson, application/json`
const commonHeaders = {
  'x-tsr-serverFn': 'true',
  'sec-fetch-site': 'same-origin',
  accept: acceptHeader,
} satisfies HeadersInit
const postHeaders = {
  ...commonHeaders,
  'content-type': 'application/json',
} satisfies HeadersInit
const serverFnRequestLoopOptions = {
  seed: benchmarkSeed,
  iterations: 100,
} as const

export const serverFnBenchOptions = {
  warmupIterations: 100,
  time: 10_000,
  throws: true,
} as const

function createPayloads() {
  const random = createDeterministicRandom(benchmarkSeed)

  return Array.from({ length: 10 }, (_, index): Payload => {
    const queryParts = Array.from({ length: 6 }, () => randomSegment(random))

    return {
      q: `q-${index}-${queryParts.join('-')}`,
      n: 100 + index,
      nested: {
        list: Array.from(
          { length: 5 },
          () => `l-${index}-${randomSegment(random)}-${randomSegment(random)}`,
        ),
      },
    }
  })
}

async function createBodies(payloads: Array<Payload>) {
  return await Promise.all(
    payloads.map(async (payload) =>
      JSON.stringify(await toJSONAsync({ data: payload })),
    ),
  )
}

function createGetQueries(bodies: Array<string>) {
  return bodies.map((body) => `?${new URLSearchParams({ payload: body })}`)
}

async function discoverUrls(handler: StartRequestHandler) {
  const response = await handler.fetch(new Request(`${origin}/api/fn-urls`))

  if (response.status === 404) {
    throw new Error('URL discovery route returned 404 for /api/fn-urls')
  }

  if (response.status !== 200) {
    throw new Error(
      `URL discovery failed with status ${response.status}: ${await response.text()}`,
    )
  }

  const urls = (await response.json()) as Partial<FnUrls>

  if (typeof urls.get !== 'string' || typeof urls.post !== 'string') {
    throw new Error(
      `URL discovery returned invalid payload: ${JSON.stringify(urls)}`,
    )
  }

  return { get: urls.get, post: urls.post }
}

async function assertServerFnResponse({
  response,
  label,
  expectedMarker,
}: {
  response: Response
  label: string
  expectedMarker: string
}) {
  const text = await response.text()

  if (response.status === 403) {
    throw new Error(
      `${label} sanity check failed with 403. Check CSRF headers.`,
    )
  }

  if (response.status === 404) {
    throw new Error(
      `${label} sanity check failed with 404. The discovered server function URL is stale.`,
    )
  }

  if (response.status !== 200) {
    throw new Error(
      `${label} sanity check failed with status ${response.status}: ${text}`,
    )
  }

  if (!response.headers.get(xTssSerialized)) {
    throw new Error(`${label} sanity check missing ${xTssSerialized} header`)
  }

  try {
    JSON.parse(text)
  } catch (error) {
    throw new Error(`${label} sanity check returned invalid JSON: ${text}`, {
      cause: error,
    })
  }

  if (!text.includes(expectedMarker)) {
    throw new Error(
      `${label} sanity check did not include expected marker ${expectedMarker}: ${text}`,
    )
  }
}

function buildGetRequest(urls: FnUrls, queries: Array<string>, index: number) {
  return new Request(`${origin}${urls.get}${queries[index % queries.length]}`, {
    method: 'GET',
    headers: commonHeaders,
  })
}

function buildPostRequest(urls: FnUrls, bodies: Array<string>, index: number) {
  return new Request(`${origin}${urls.post}`, {
    method: 'POST',
    headers: postHeaders,
    body: bodies[index % bodies.length],
  })
}

export async function setupServerFnBench(handler: StartRequestHandler) {
  const urls = await discoverUrls(handler)
  const payloads = createPayloads()
  const bodies = await createBodies(payloads)
  const getQueries = createGetQueries(bodies)
  const expectedMarker = `out-${payloads[0]!.nested.list[0]}`

  return { urls, bodies, getQueries, expectedMarker }
}

export async function assertServerFnScenario(
  handler: StartRequestHandler,
  context: ServerFnBenchContext,
) {
  await assertServerFnResponse({
    response: await handler.fetch(
      buildGetRequest(context.urls, context.getQueries, 0),
    ),
    label: 'GET',
    expectedMarker: context.expectedMarker,
  })
  await assertServerFnResponse({
    response: await handler.fetch(
      buildPostRequest(context.urls, context.bodies, 0),
    ),
    label: 'POST',
    expectedMarker: context.expectedMarker,
  })
}

export function runServerFnGetRequestLoop(
  handler: StartRequestHandler,
  context: ServerFnBenchContext,
) {
  return runRequestLoop(handler, {
    ...serverFnRequestLoopOptions,
    buildRequest: (_random, index) =>
      buildGetRequest(context.urls, context.getQueries, index),
  })
}

export function runServerFnPostRequestLoop(
  handler: StartRequestHandler,
  context: ServerFnBenchContext,
) {
  return runRequestLoop(handler, {
    ...serverFnRequestLoopOptions,
    buildRequest: (_random, index) =>
      buildPostRequest(context.urls, context.bodies, index),
  })
}
