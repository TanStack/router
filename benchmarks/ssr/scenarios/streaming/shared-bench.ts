import { expect } from 'vitest'
import { streamChunkCount } from './shared-data'
import { randomSegment, runRequestLoop } from '../../bench-utils'
import type { StartRequestHandler } from '../../bench-utils'

export type { StartRequestHandler }

const benchmarkSeed = 0xdecafbad

export const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
    'user-agent': CHROME_UA,
  },
} satisfies RequestInit

function buildStreamingRequest(random: () => number) {
  return new Request(
    `http://localhost/stream/${randomSegment(random)}`,
    requestInit,
  )
}

export async function assertStreamingSanity(handler: StartRequestHandler) {
  const id = 'sanity-stream'
  const response = await handler.fetch(
    new Request(`http://localhost/stream/${id}`, requestInit),
  )
  const body = await response.text()
  const fallbackIndex = body.indexOf('loading-small')
  const tsrIndex = body.indexOf('$_TSR')

  expect(response.status).toBe(200)
  expect(body).toContain('loading-small')
  expect(body).toContain('loading-big')
  expect(body).toContain(`slow-small-${id}`)
  expect(body).toContain(`slow-big-${id}`)
  expect(body).toContain(`${id}:0:`)
  expect(body).toContain(`${id}:${streamChunkCount - 1}:`)
  expect(fallbackIndex).toBeGreaterThanOrEqual(0)
  expect(tsrIndex).toBeGreaterThan(fallbackIndex)
}

export const benchOptions = {
  warmupIterations: 100,
  time: 10_000,
  throws: true,
}

export function runStreamingLoop(handler: StartRequestHandler) {
  return runRequestLoop(handler, {
    seed: benchmarkSeed,
    buildRequest: buildStreamingRequest,
  })
}
