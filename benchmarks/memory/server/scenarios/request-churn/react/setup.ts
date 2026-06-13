import {
  randomSegment,
  runSequentialRequestLoop,
} from '#memory-server/bench-utils'
import type { StartRequestHandler } from '#memory-server/bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const benchmarkSeed = 0xdecafbad
const requestChurnIterations = 200
const itemPageMarker = 'data-bench="request-churn-item"'
const dehydrationMarker = '$_TSR'

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

function buildItemRequest(random: () => number) {
  const id = randomSegment(random)
  const q = `q-${randomSegment(random)}`

  return new Request(`http://localhost/items/${id}?q=${q}`, requestInit)
}

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

  if (!body.includes(dehydrationMarker)) {
    throw new Error(
      'Expected sanity response to include the dehydration marker',
    )
  }
}

export async function setup() {
  const { default: handler } = (await import(
    /* @vite-ignore */ appModuleUrl
  )) as {
    default: StartRequestHandler
  }

  const run = () =>
    runSequentialRequestLoop(handler, {
      seed: benchmarkSeed,
      iterations: requestChurnIterations,
      buildRequest: buildItemRequest,
      validateResponse: validateItemResponse,
    })

  return {
    sanity: () => assertRequestChurnSanity(handler),
    run,
    benches: [
      {
        name: 'mem request-churn (react)',
        run,
      },
    ],
  }
}
