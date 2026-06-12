import { bench, describe } from 'vitest'
import {
  memoryBenchOptions,
  randomSegment,
  runSequentialRequestLoop,
} from '../../../bench-utils'
import type { StartRequestHandler } from '../../../bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const errorPathsIterations = 50
const redirectSeed = 0xdecafbad
const notFoundSeed = 0xdecafb0d
const errorSeed = 0xdecafbed
const unmatchedSeed = 0xdecaf00d

const redirectStatus = 302
const notFoundStatus = 404
const errorStatus = 500
const notFoundMarker = 'data-bench="not-found-boundary"'
const errorMarker = 'data-bench="error-boundary"'

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

function buildRedirectRequest(random: () => number) {
  return new Request(
    `http://localhost/from/${randomSegment(random)}`,
    requestInit,
  )
}

function buildNotFoundRequest(random: () => number) {
  return new Request(
    `http://localhost/missing/${randomSegment(random)}`,
    requestInit,
  )
}

function buildErrorRequest(random: () => number) {
  return new Request(
    `http://localhost/boom/${randomSegment(random)}`,
    requestInit,
  )
}

function buildUnmatchedRequest(random: () => number) {
  return new Request(
    `http://localhost/nope/${randomSegment(random)}`,
    requestInit,
  )
}

function getRequestId(request: Request) {
  const id = new URL(request.url).pathname.split('/').pop()

  if (!id) {
    throw new Error(`Expected request id in ${request.url}`)
  }

  return id
}

function validateRedirectResponse(response: Response, request: Request) {
  if (response.status !== redirectStatus) {
    throw new Error(
      `Expected status ${redirectStatus} for ${request.url}, got ${response.status}`,
    )
  }

  const id = getRequestId(request)
  const location = response.headers.get('location')

  if (location !== `/target/${id}`) {
    throw new Error(`Expected redirect location /target/${id}, got ${location}`)
  }
}

function validateNotFoundResponse(response: Response, request: Request) {
  if (response.status !== notFoundStatus) {
    throw new Error(
      `Expected status ${notFoundStatus} for ${request.url}, got ${response.status}`,
    )
  }
}

function validateErrorResponse(response: Response, request: Request) {
  if (response.status !== errorStatus) {
    throw new Error(
      `Expected status ${errorStatus} for ${request.url}, got ${response.status}`,
    )
  }
}

function validateNotFoundBody(body: string) {
  if (!body.includes(notFoundMarker)) {
    throw new Error('Expected error-paths not-found marker in response body')
  }
}

function validateErrorBody(body: string) {
  if (!body.includes(errorMarker)) {
    throw new Error('Expected error-paths error marker in response body')
  }
}

async function assertStatusSanity(
  request: Request,
  validateResponse: (response: Response, request: Request) => void,
  validateBody?: (body: string) => void,
) {
  const response = await handler.fetch(request)
  validateResponse(response, request)

  const body = await response.text()
  validateBody?.(body)
}

async function assertErrorPathsSanity() {
  await assertStatusSanity(
    new Request('http://localhost/from/sanity-redirect', requestInit),
    validateRedirectResponse,
  )
  await assertStatusSanity(
    new Request('http://localhost/missing/sanity-missing', requestInit),
    validateNotFoundResponse,
    validateNotFoundBody,
  )
  await assertStatusSanity(
    new Request('http://localhost/boom/sanity-error', requestInit),
    validateErrorResponse,
    validateErrorBody,
  )
  await assertStatusSanity(
    new Request('http://localhost/nope/sanity-unmatched', requestInit),
    validateNotFoundResponse,
  )
}

await assertErrorPathsSanity()

describe('memory', () => {
  bench(
    'mem error-paths redirect (react)',
    () =>
      runSequentialRequestLoop(handler, {
        seed: redirectSeed,
        iterations: errorPathsIterations,
        buildRequest: buildRedirectRequest,
        validateResponse: validateRedirectResponse,
      }),
    memoryBenchOptions,
  )

  bench(
    'mem error-paths not-found (react)',
    () =>
      runSequentialRequestLoop(handler, {
        seed: notFoundSeed,
        iterations: errorPathsIterations,
        buildRequest: buildNotFoundRequest,
        validateResponse: validateNotFoundResponse,
        validateBody: validateNotFoundBody,
      }),
    memoryBenchOptions,
  )

  bench(
    'mem error-paths error (react)',
    () =>
      runSequentialRequestLoop(handler, {
        seed: errorSeed,
        iterations: errorPathsIterations,
        buildRequest: buildErrorRequest,
        validateResponse: validateErrorResponse,
        validateBody: validateErrorBody,
      }),
    memoryBenchOptions,
  )

  bench(
    'mem error-paths unmatched (react)',
    () =>
      runSequentialRequestLoop(handler, {
        seed: unmatchedSeed,
        iterations: errorPathsIterations,
        buildRequest: buildUnmatchedRequest,
        validateResponse: validateNotFoundResponse,
      }),
    memoryBenchOptions,
  )
})
