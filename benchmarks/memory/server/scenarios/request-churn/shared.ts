import {
  createDeterministicRandom,
  randomSegment,
  runSequentialRequestLoop,
} from '#memory-server/bench-utils'
import type { StartRequestHandler } from '#memory-server/bench-utils'

export type { StartRequestHandler }

type Framework = 'react' | 'solid' | 'vue'

const benchmarkSeed = 0xdecafbad
const requestChurnIterations = 80
const requestChurnWarmupIterations = 8
const itemPageMarker = 'data-bench="request-churn-item"'
// Module-level within the isolated process so URLs stay unique throughout the
// inner loop. Every fresh CodSpeed invocation deliberately replays this same
// sequence against a fresh handler process.
const benchmarkRandom = createDeterministicRandom(benchmarkSeed)
let requestCounter = 0

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

function validateItemResponse(response: Response, request: Request) {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200 for ${request.url}, got ${response.status}`,
    )
  }
}

function validateItemBody(body: string) {
  if (!body.includes(itemPageMarker)) {
    throw new Error('Expected request-churn item marker in response body')
  }
}

async function assertRequestChurnSanity(handler: StartRequestHandler) {
  const response = await handler.fetch(
    new Request('http://localhost/items/sanity-item?q=q-sanity', requestInit),
  )
  const body = await response.text()

  if (response.status !== 200) {
    throw new Error(`Expected sanity status 200, got ${response.status}`)
  }

  validateItemBody(body)
}

export function createWorkloadGroup(
  framework: Framework,
  handler: StartRequestHandler,
) {
  function createItemRequest(random: () => number, counter: string) {
    const id = `${counter}-${randomSegment(random)}`
    const q = `q-${randomSegment(random)}`

    return new Request(`http://localhost/items/${id}?q=${q}`, requestInit)
  }

  function buildItemRequest(random: () => number) {
    return createItemRequest(random, (requestCounter++).toString(36))
  }

  const run = () =>
    runSequentialRequestLoop(handler, {
      random: benchmarkRandom,
      iterations: requestChurnIterations,
      buildRequest: buildItemRequest,
      validateResponse: validateItemResponse,
      pinGcBetweenIterations: true,
    })

  const warmup = () => {
    let counter = 0

    return runSequentialRequestLoop(handler, {
      seed: 0x5e7a11ce,
      iterations: requestChurnWarmupIterations,
      buildRequest: (random) =>
        createItemRequest(random, `warmup-${(counter++).toString(36)}`),
      validateResponse: validateItemResponse,
      pinGcBetweenIterations: true,
    })
  }

  return {
    sanity: () => assertRequestChurnSanity(handler),
    warmup,
    workloads: [
      {
        name: `mem server request-churn (${framework})`,
        run,
      },
    ],
  }
}
