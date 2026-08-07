import {
  createDeterministicRandom,
  randomSegment,
  runSequentialRequestLoop,
} from '#memory-server/bench-utils'
import type { StartRequestHandler } from '#memory-server/bench-utils'

export type { StartRequestHandler }

type Framework = 'react' | 'solid' | 'vue'

type FnUrls = {
  get: string
  post: string
}

type PayloadFixture = {
  id: string
  body: string
  query: string
}

type SerovalNode =
  | {
      t: 1
      s: string
    }
  | {
      t: 10
      i: number
      p: {
        k: Array<string>
        v: Array<SerovalNode>
      }
      o: number
    }

const benchmarkSeed = 0xdecafbad
const payloadSeed = 0x51f0cafe
// Twice the count needed for the original ~2s CI floor (per-iteration cost
// with the pinned collection is ~0.08-0.11s across frameworks), so the regular
// loop shape dominates the timeline and an accumulating leak is amplified.
const serverFnChurnIterations = 60
const serverFnChurnWarmupIterations = 8
const fixtureCount = Math.ceil(serverFnChurnIterations / 2)
const origin = 'http://localhost'
const tssContentTypeFramed = 'application/x-tss-framed'
const acceptHeader = `${tssContentTypeFramed}, application/x-ndjson, application/json`
const xTssSerialized = 'x-tss-serialized'
const contextMarker = 'ctx-server-fn-churn'

const commonHeaders = {
  'x-tsr-serverFn': 'true',
  'sec-fetch-site': 'same-origin',
  accept: acceptHeader,
} satisfies HeadersInit

const postHeaders = {
  ...commonHeaders,
  'content-type': 'application/json',
} satisfies HeadersInit

// Hand-rolled copy of Start's seroval RPC wire format so POST bodies can be
// precomputed at module level. Coupled to the internal protocol on purpose;
// the module-load sanity check below throws loudly if the protocol drifts.
function stringNode(value: string): SerovalNode {
  return { t: 1, s: value }
}

function objectNode(
  id: number,
  entries: Array<readonly [string, SerovalNode]>,
): SerovalNode {
  return {
    t: 10,
    i: id,
    p: {
      k: entries.map(([key]) => key),
      v: entries.map(([, value]) => value),
    },
    o: 0,
  }
}

function serializePayload(id: string) {
  return JSON.stringify({
    t: objectNode(0, [['data', objectNode(1, [['id', stringNode(id)]])]]),
    f: 63,
    m: [],
  })
}

function createFixtures(
  kind: 'get' | 'post',
  seed = payloadSeed ^ kind.length,
  prefix: string = kind,
  count = fixtureCount,
) {
  const random = createDeterministicRandom(seed)

  return Array.from({ length: count }, (_, index): PayloadFixture => {
    const id = [
      prefix,
      index,
      randomSegment(random),
      randomSegment(random),
    ].join('-')
    const body = serializePayload(id)

    return {
      id,
      body,
      query: `?${new URLSearchParams({ payload: body })}`,
    }
  })
}

const getFixtures = createFixtures('get')
const postFixtures = createFixtures('post')
const sanityGetFixture = createFixtures('get', 0x51f0ca01, 'sanity-get', 1)[0]!
const sanityPostFixture = createFixtures(
  'post',
  0x51f0ca02,
  'sanity-post',
  1,
)[0]!
const warmupGetFixtures = createFixtures('get', 0x51f0ca11, 'warmup-get')
const warmupPostFixtures = createFixtures('post', 0x51f0ca12, 'warmup-post')

async function discoverUrls(handler: StartRequestHandler) {
  const response = await handler.fetch(new Request(`${origin}/api/fn-urls`))
  const text = await response.text()

  if (response.status !== 200) {
    throw new Error(
      `URL discovery failed with status ${response.status}: ${text}`,
    )
  }

  let urls: Partial<FnUrls>

  try {
    urls = JSON.parse(text) as Partial<FnUrls>
  } catch (error) {
    throw new Error(`URL discovery returned invalid JSON: ${text}`, {
      cause: error,
    })
  }

  if (typeof urls.get !== 'string' || typeof urls.post !== 'string') {
    throw new Error(`URL discovery returned invalid payload: ${text}`)
  }

  return urls as FnUrls
}

function buildGetRequest(url: string, fixture: PayloadFixture) {
  return new Request(`${origin}${url}${fixture.query}`, {
    method: 'GET',
    headers: commonHeaders,
  })
}

function buildPostRequest(url: string, fixture: PayloadFixture) {
  return new Request(`${origin}${url}`, {
    method: 'POST',
    headers: postHeaders,
    body: fixture.body,
  })
}

function validateServerFnResponse(response: Response, request: Request) {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200 for ${request.url}, got ${response.status}`,
    )
  }

  if (!response.headers.get(xTssSerialized)) {
    throw new Error(`Expected ${xTssSerialized} header for ${request.url}`)
  }
}

function validateEchoedBody(
  body: string,
  request: Request,
  expectedId: string,
) {
  if (!body.includes(expectedId)) {
    throw new Error(`Expected echoed id ${expectedId} in ${request.url}`)
  }

  if (!body.includes(contextMarker)) {
    throw new Error(
      `Expected context marker ${contextMarker} in ${request.url}`,
    )
  }
}

async function assertServerFnChurnSanity(
  handler: StartRequestHandler,
  urls: FnUrls,
) {
  const getFixture = sanityGetFixture
  const getRequest = buildGetRequest(urls.get, getFixture)
  const getResponse = await handler.fetch(getRequest)
  const getBody = await getResponse.text()

  validateServerFnResponse(getResponse, getRequest)
  validateEchoedBody(getBody, getRequest, getFixture.id)

  const postFixture = sanityPostFixture
  const postRequest = buildPostRequest(urls.post, postFixture)
  const postResponse = await handler.fetch(postRequest)
  const postBody = await postResponse.text()

  validateServerFnResponse(postResponse, postRequest)
  validateEchoedBody(postBody, postRequest, postFixture.id)
}

function runServerFnLoop(
  handler: StartRequestHandler,
  urls: FnUrls,
  options: {
    iterations: number
    seed: number
    getFixtures: ReadonlyArray<PayloadFixture>
    postFixtures: ReadonlyArray<PayloadFixture>
  },
) {
  return runSequentialRequestLoop(handler, {
    seed: options.seed,
    iterations: options.iterations,
    pinGcBetweenIterations: true,
    buildRequest: (_random, index) => {
      const fixtureIndex = Math.floor(index / 2) % fixtureCount

      if (index % 2 === 0) {
        const fixture = options.getFixtures[fixtureIndex]!
        return buildGetRequest(urls.get, fixture)
      } else {
        const fixture = options.postFixtures[fixtureIndex]!
        return buildPostRequest(urls.post, fixture)
      }
    },
    validateResponse: validateServerFnResponse,
  })
}

export async function createWorkloadGroup(
  framework: Framework,
  handler: StartRequestHandler,
) {
  const urls = await discoverUrls(handler)
  const run = () =>
    runServerFnLoop(handler, urls, {
      seed: benchmarkSeed,
      iterations: serverFnChurnIterations,
      getFixtures,
      postFixtures,
    })

  return {
    sanity: () => assertServerFnChurnSanity(handler, urls),
    warmup: () =>
      runServerFnLoop(handler, urls, {
        seed: 0x5e7f0c11,
        iterations: serverFnChurnWarmupIterations,
        getFixtures: warmupGetFixtures,
        postFixtures: warmupPostFixtures,
      }),
    workloads: [
      {
        name: `mem server server-fn-churn (${framework})`,
        run,
      },
    ],
  }
}
