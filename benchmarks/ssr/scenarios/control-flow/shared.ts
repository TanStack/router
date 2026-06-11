import { expect } from 'vitest'
import { randomSegment, runRequestLoop } from '../../bench-utils'
import type { StartRequestHandler } from '../../bench-utils'

export type { StartRequestHandler }

const benchmarkSeed = 0xdecafbad
const redirectLoopIterations = 100

// Pinned to the current built handler responses for these control-flow routes.
const REDIRECT_STATUS = 307
const NOT_FOUND_STATUS = 404

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

export const controlFlowBenchOptions = {
  warmupIterations: 100,
  time: 10_000,
  throws: true,
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

function validateRedirectResponse(response: Response) {
  if (response.status !== REDIRECT_STATUS) {
    throw new Error(`expected ${REDIRECT_STATUS}, got ${response.status}`)
  }
}

function validateNotFoundResponse(response: Response) {
  if (response.status !== NOT_FOUND_STATUS) {
    throw new Error(`expected ${NOT_FOUND_STATUS}, got ${response.status}`)
  }
}

export function runRedirectLoop(handler: StartRequestHandler) {
  return runRequestLoop(handler, {
    seed: benchmarkSeed,
    iterations: redirectLoopIterations,
    buildRequest: buildRedirectRequest,
    validateResponse: validateRedirectResponse,
  })
}

export function runNotFoundLoop(handler: StartRequestHandler) {
  return runRequestLoop(handler, {
    seed: benchmarkSeed,
    buildRequest: buildNotFoundRequest,
    validateResponse: validateNotFoundResponse,
  })
}

export async function assertControlFlowSanity(handler: StartRequestHandler) {
  const redirectId = 'sanity-redirect'
  const redirectResponse = await handler.fetch(
    new Request(`http://localhost/from/${redirectId}`, requestInit),
  )

  expect(redirectResponse.status).toBe(REDIRECT_STATUS)
  expect(redirectResponse.headers.get('location')).toBe(`/target/${redirectId}`)

  const notFoundResponse = await handler.fetch(
    new Request('http://localhost/missing/sanity-missing', requestInit),
  )
  const notFoundBody = await notFoundResponse.text()

  expect(notFoundResponse.status).toBe(NOT_FOUND_STATUS)
  expect(notFoundBody).toContain('root-not-found-marker')
}
