import {
  createDeterministicRandom,
  randomSegment,
  runSequentialRequestLoop,
} from '#memory-server/bench-utils'
import type { StartRequestHandler } from '#memory-server/bench-utils'

export type { StartRequestHandler }

type Framework = 'react' | 'solid' | 'vue'

// Twice the count needed for the original ~2s CI floor (per-iteration cost
// with the pinned collection is ~0.13-0.19s across frameworks), so the regular
// loop shape dominates the timeline and an accumulating leak is amplified.
const errorPathsIterations = 36
const errorPathsWarmupIterations = errorPathsIterations
const redirectSeed = 0xdecafbad
const notFoundSeed = 0xdecafb0d
const errorSeed = 0xdecafbed
const unmatchedSeed = 0xdecaf00d
const redirectStatus = 302
const notFoundStatus = 404
const errorStatus = 500
// Module-level within the isolated process so each error-path inner loop uses
// unique URLs. Fresh CodSpeed invocations replay the sequence in a fresh handler.
const redirectRandom = createDeterministicRandom(redirectSeed)
const notFoundRandom = createDeterministicRandom(notFoundSeed)
const errorRandom = createDeterministicRandom(errorSeed)
const unmatchedRandom = createDeterministicRandom(unmatchedSeed)
let redirectCounter = 0
let notFoundCounter = 0
let errorCounter = 0
let unmatchedCounter = 0

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

async function assertStatusSanity(
  handler: StartRequestHandler,
  request: Request,
  validateResponse: (response: Response, request: Request) => void,
) {
  const response = await handler.fetch(request)
  validateResponse(response, request)
  await response.text()
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
  )
  await assertStatusSanity(
    handler,
    new Request('http://localhost/boom/sanity-error', requestInit),
    validateErrorResponse,
  )
  await assertStatusSanity(
    handler,
    new Request('http://localhost/nope/sanity-unmatched', requestInit),
    validateNotFoundResponse,
  )
}

function runErrorPathWarmup(
  handler: StartRequestHandler,
  options: {
    path: string
    seed: number
    validateResponse: (response: Response, request: Request) => void
  },
) {
  let counter = 0

  return runSequentialRequestLoop(handler, {
    seed: options.seed,
    iterations: errorPathsWarmupIterations,
    buildRequest: (random) => {
      const id = `warmup-${(counter++).toString(36)}-${randomSegment(random)}`
      return new Request(`http://localhost/${options.path}/${id}`, requestInit)
    },
    validateResponse: options.validateResponse,
    pinGcBetweenIterations: true,
  })
}

export function createWorkloadGroup(
  framework: Framework,
  handler: StartRequestHandler,
) {
  const runRedirect = () =>
    runSequentialRequestLoop(handler, {
      random: redirectRandom,
      iterations: errorPathsIterations,
      buildRequest: buildRedirectRequest,
      validateResponse: validateRedirectResponse,
      pinGcBetweenIterations: true,
    })

  const runNotFound = () =>
    runSequentialRequestLoop(handler, {
      random: notFoundRandom,
      iterations: errorPathsIterations,
      buildRequest: buildNotFoundRequest,
      validateResponse: validateNotFoundResponse,
      pinGcBetweenIterations: true,
    })

  const runError = () =>
    runSequentialRequestLoop(handler, {
      random: errorRandom,
      iterations: errorPathsIterations,
      buildRequest: buildErrorRequest,
      validateResponse: validateErrorResponse,
      pinGcBetweenIterations: true,
    })

  const runUnmatched = () =>
    runSequentialRequestLoop(handler, {
      random: unmatchedRandom,
      iterations: errorPathsIterations,
      buildRequest: buildUnmatchedRequest,
      validateResponse: validateNotFoundResponse,
      pinGcBetweenIterations: true,
    })

  async function warmup() {
    await runErrorPathWarmup(handler, {
      path: 'from',
      seed: 0x7ed1ec71,
      validateResponse: validateRedirectResponse,
    })
    await runErrorPathWarmup(handler, {
      path: 'missing',
      seed: 0x7ed1ec72,
      validateResponse: validateNotFoundResponse,
    })
    await runErrorPathWarmup(handler, {
      path: 'boom',
      seed: 0x7ed1ec73,
      validateResponse: validateErrorResponse,
    })
    await runErrorPathWarmup(handler, {
      path: 'nope',
      seed: 0x7ed1ec74,
      validateResponse: validateNotFoundResponse,
    })
  }

  return {
    sanity: () => assertErrorPathsSanity(handler),
    warmup,
    workloads: [
      {
        name: `mem server error-paths redirect (${framework})`,
        run: runRedirect,
      },
      {
        name: `mem server error-paths not-found (${framework})`,
        run: runNotFound,
      },
      {
        name: `mem server error-paths error (${framework})`,
        run: runError,
      },
      {
        name: `mem server error-paths unmatched (${framework})`,
        run: runUnmatched,
      },
    ],
  }
}
