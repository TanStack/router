import { afterAll, bench, describe, expect, vi } from 'vitest'
import { fromCrossJSON } from 'seroval'
import {
  createCsrfMiddleware,
  createMiddleware,
} from '@tanstack/start-client-core'
import { runRequestLoop } from '../../../benchmarks/ssr/bench-utils'
import { createStartHandler } from '../src/createStartHandler'
import {
  appendResponseHeader,
  setCookie,
  setResponseHeader,
} from '../src/request-response'

const fixture = vi.hoisted(() => {
  const previousServerFnBase = process.env.TSS_SERVER_FN_BASE
  process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  return { previousServerFnBase }
})

// Supply the compiler's virtual entries while keeping the real request,
// server-function transport, serialization, and reconciliation implementations.
vi.mock('#tanstack-start-entry', () => ({
  startInstance: {
    getOptions: () => ({ requestMiddleware, serializationAdapters: [] }),
  },
}))
vi.mock('#tanstack-router-entry', () => ({
  getRouter: () => {
    throw new Error('Server-function requests should not create a router')
  },
}))
vi.mock('#tanstack-start-server-fn-resolver', () => ({
  getServerFnById: (id: string) => {
    const action = actions.get(id)
    if (!action) {
      throw new Error(`Unknown benchmark function: ${id}`)
    }
    return action
  },
}))

function responseMiddleware(layer: string) {
  return createMiddleware().server(async ({ request, next }) => {
    const helpers = request.url.includes('/serialized-helpers?')
    if (helpers) {
      setResponseHeader('x-helper', layer)
      appendResponseHeader('x-steps', `${layer}-before`)
      setCookie(layer, 'before')
    }

    const result = await next()

    if (helpers) {
      appendResponseHeader('x-steps', `${layer}-after`)
      setCookie(layer, 'after')
    }
    if (request.url.includes('/raw-')) {
      if (!request.url.includes('/raw-unchanged-')) {
        result.response.headers.delete('x-tss-raw')
      }
    } else if (!request.url.includes('/serialized-unchanged?')) {
      result.response.headers.set('content-type', 'text/plain')
      result.response.headers.delete('x-tss-serialized')
      result.response.headers.set('x-tss-raw', 'true')
    }

    return result
  })
}

const requestMiddleware = [
  createCsrfMiddleware(),
  responseMiddleware('outer'),
  responseMiddleware('inner'),
]
const cookies = [
  'first=one; Path=/',
  'second=two; Path=/',
  'third=three; Path=/',
]
const result = { answer: 42, label: 'response-reconciliation' }
const scenarios = [
  {
    id: 'serialized-unchanged',
    name: 'serialized response with unchanged protocol headers',
    extraHeaders: undefined,
    action: () => ({ result }),
  },
  {
    id: 'serialized-repaired',
    name: 'serialized response with two protocol repairs',
    extraHeaders: undefined,
    action: () => ({ result }),
  },
  {
    id: 'serialized-helpers',
    name: 'serialized response with two protocol repairs and helper writes',
    extraHeaders: undefined,
    action: () => ({ result }),
  },
  ...[0, 4, 20].flatMap((extraHeaders) =>
    [false, true].map((repair) => ({
      id: `raw-${repair ? 'repaired' : 'unchanged'}-${extraHeaders}`,
      name: `raw response with ${repair ? 'two protocol repairs' : 'unchanged protocol headers'}, ${extraHeaders} extra headers and three cookies`,
      extraHeaders,
      action: () => {
        const headers = new Headers({ 'content-type': 'text/plain' })
        for (let index = 0; index < extraHeaders; index++) {
          headers.set(`x-extra-${index}`, `value-${index}`)
        }
        for (const cookie of cookies) {
          headers.append('set-cookie', cookie)
        }
        return { result: new Response('raw-response', { headers }) }
      },
    })),
  ),
]
const actions = new Map(
  scenarios.map((scenario) => [scenario.id, scenario.action]),
)

const fetch = createStartHandler(() => {
  throw new Error('Server-function requests should not render HTML')
})
const handler = { fetch: (request: Request) => fetch(request, {}) }
const requestHeaders = {
  'x-tsr-serverFn': 'true',
  'sec-fetch-site': 'same-origin',
  accept: 'application/json',
}

function requestFor(id: string, sample: number) {
  return new Request(`http://localhost/_serverFn/${id}?sample=${sample}`, {
    headers: requestHeaders,
  })
}

// Assertions run once before timed batches. The hot loops only dispatch and
// drain responses; they never decode JSON or run assertion-library matchers.
for (const scenario of scenarios) {
  const response = await handler.fetch(requestFor(scenario.id, 0))
  expect(response.status).toBe(200)
  if (scenario.extraHeaders === undefined) {
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(response.headers.get('x-tss-serialized')).toBe('true')
    expect(response.headers.get('x-tss-raw')).toBeNull()
    expect(fromCrossJSON(await response.json(), {})).toEqual({ result })
    if (scenario.id === 'serialized-helpers') {
      expect(response.headers.get('x-helper')).toBe('inner')
      expect(response.headers.get('x-steps')).toBe(
        'outer-before, inner-before, inner-after, outer-after',
      )
      expect(response.headers.getSetCookie().sort()).toEqual([
        'inner=after; Path=/',
        'outer=after; Path=/',
      ])
    }
  } else {
    expect(response.headers.get('content-type')).toBe('text/plain')
    expect(response.headers.get('x-tss-raw')).toBe('true')
    expect(response.headers.get('x-tss-serialized')).toBeNull()
    expect(response.headers.getSetCookie()).toEqual(cookies)
    for (let index = 0; index < scenario.extraHeaders; index++) {
      expect(response.headers.get(`x-extra-${index}`)).toBe(`value-${index}`)
    }
    expect(await response.text()).toBe('raw-response')
  }
}

afterAll(() => {
  if (fixture.previousServerFnBase === undefined) {
    Reflect.deleteProperty(process.env, 'TSS_SERVER_FN_BASE')
  } else {
    process.env.TSS_SERVER_FN_BASE = fixture.previousServerFnBase
  }
})

describe('response reconciliation', () => {
  for (const scenario of scenarios) {
    bench(
      scenario.name,
      () =>
        runRequestLoop(handler, {
          seed: 0xdecafbad,
          concurrency: 8,
          totalRequests: 160,
          buildRequest: (random) =>
            requestFor(scenario.id, Math.floor(random() * 1_000_000)),
        }),
      { warmupIterations: 100, time: 5_000, throws: true },
    )
  }
})
