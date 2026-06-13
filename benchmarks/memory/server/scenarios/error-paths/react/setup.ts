import {
  createDeterministicRandom,
  randomSegment,
  runSequentialRequestLoop,
} from '#memory-server/bench-utils'
import type { StartRequestHandler } from '#memory-server/bench-utils'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href
const errorPathsIterations = 50
const redirectSeed = 0xdecafbad
const notFoundSeed = 0xdecafb0d
const errorSeed = 0xdecafbed
const unmatchedSeed = 0xdecaf00d
// Module-level so each error-path bench keeps advancing across runner invocations.
const redirectRandom = createDeterministicRandom(redirectSeed)
const notFoundRandom = createDeterministicRandom(notFoundSeed)
const errorRandom = createDeterministicRandom(errorSeed)
const unmatchedRandom = createDeterministicRandom(unmatchedSeed)
let redirectCounter = 0
let notFoundCounter = 0
let errorCounter = 0
let unmatchedCounter = 0

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

function buildRedirectRequest(random: () => number) {
  const id = `${(redirectCounter++).toString(36)}-${randomSegment(random)}`

  return new Request(`http://localhost/from/${id}`, requestInit)
}

function buildNotFoundRequest(random: () => number) {
  const id = `${(notFoundCounter++).toString(36)}-${randomSegment(random)}`

  return new Request(`http://localhost/missing/${id}`, requestInit)
}

function buildErrorRequest(random: () => number) {
  const id = `${(errorCounter++).toString(36)}-${randomSegment(random)}`

  return new Request(`http://localhost/boom/${id}`, requestInit)
}

function buildUnmatchedRequest(random: () => number) {
  const id = `${(unmatchedCounter++).toString(36)}-${randomSegment(random)}`

  return new Request(`http://localhost/nope/${id}`, requestInit)
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
  handler: StartRequestHandler,
  request: Request,
  validateResponse: (response: Response, request: Request) => void,
  validateBody?: (body: string) => void,
) {
  const response = await handler.fetch(request)
  validateResponse(response, request)

  const body = await response.text()
  validateBody?.(body)
}

async function assertErrorPathsSanity(handler: StartRequestHandler) {
  await assertStatusSanity(
    handler,
    new Request('http://localhost/from/sanity-redirect', requestInit),
    validateRedirectResponse,
  )
  await assertStatusSanity(
    handler,
    new Request('http://localhost/missing/sanity-missing', requestInit),
    validateNotFoundResponse,
    validateNotFoundBody,
  )
  await assertStatusSanity(
    handler,
    new Request('http://localhost/boom/sanity-error', requestInit),
    validateErrorResponse,
    validateErrorBody,
  )
  await assertStatusSanity(
    handler,
    new Request('http://localhost/nope/sanity-unmatched', requestInit),
    validateNotFoundResponse,
  )
}

export async function setup() {
  const { default: handler } = (await import(
    /* @vite-ignore */ appModuleUrl
  )) as {
    default: StartRequestHandler
  }

  const runRedirect = () =>
    runSequentialRequestLoop(handler, {
      random: redirectRandom,
      iterations: errorPathsIterations,
      buildRequest: buildRedirectRequest,
      validateResponse: validateRedirectResponse,
    })

  const runNotFound = () =>
    runSequentialRequestLoop(handler, {
      random: notFoundRandom,
      iterations: errorPathsIterations,
      buildRequest: buildNotFoundRequest,
      validateResponse: validateNotFoundResponse,
    })

  const runError = () =>
    runSequentialRequestLoop(handler, {
      random: errorRandom,
      iterations: errorPathsIterations,
      buildRequest: buildErrorRequest,
      validateResponse: validateErrorResponse,
    })

  const runUnmatched = () =>
    runSequentialRequestLoop(handler, {
      random: unmatchedRandom,
      iterations: errorPathsIterations,
      buildRequest: buildUnmatchedRequest,
      validateResponse: validateNotFoundResponse,
    })

  return {
    sanity: () => assertErrorPathsSanity(handler),
    benches: [
      {
        name: 'mem error-paths redirect (react)',
        run: runRedirect,
      },
      {
        name: 'mem error-paths not-found (react)',
        run: runNotFound,
      },
      {
        name: 'mem error-paths error (react)',
        run: runError,
      },
      {
        name: 'mem error-paths unmatched (react)',
        run: runUnmatched,
      },
    ],
  }
}
