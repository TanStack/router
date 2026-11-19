import { test } from 'vitest'
import { randomSegment, runRequestLoop } from '../../bench-utils'
import { MANY_ROUTE_COUNT, honoApp } from './hono'
import type { StartRequestHandler } from '../../bench-utils'

export type { StartRequestHandler }

const benchmarkSeed = 0xdecafbad
const concurrency = 16

const jsonRequestInit = {
  method: 'GET',
  headers: { accept: 'application/json' },
} satisfies RequestInit

const htmlRequestInit = {
  method: 'GET',
  headers: { accept: 'text/html' },
} satisfies RequestInit

interface Shape {
  totalRequests: number
  /** Page shapes skip Hono, which has no page to render. */
  fallback: boolean
  options: { warmupIterations: number; time: number; throws: true }
  buildRequest: (random: () => number) => Request
  /** Defaults to requiring status 200. */
  validateResponse?: (response: Response, request: Request) => void
  assert: (handler: StartRequestHandler) => Promise<void>
}

const fallbackOptions = {
  warmupIterations: 10,
  time: 10_000,
  throws: true,
} as const

async function expectHtml(
  handler: StartRequestHandler,
  path: string,
  status: number,
  marker: string,
) {
  const response = await handler.fetch(
    new Request(`http://localhost${path}`, htmlRequestInit),
  )
  const html = await response.text()
  if (response.status !== status || !html.includes(marker)) {
    throw new Error(
      `${path}: expected ${status} with "${marker}", received ${response.status}`,
    )
  }
}

const jsonOptions = {
  warmupIterations: 100,
  time: 10_000,
  throws: true,
} as const

async function expectJson(
  handler: StartRequestHandler,
  path: string,
  expected: Record<string, unknown>,
) {
  const response = await handler.fetch(
    new Request(`http://localhost${path}`, jsonRequestInit),
  )
  if (response.status !== 200) {
    throw new Error(`${path}: expected 200, received ${response.status}`)
  }
  const body = (await response.json()) as Record<string, unknown>
  for (const [key, value] of Object.entries(expected)) {
    if (body[key] !== value) {
      throw new Error(
        `${path}: expected ${key}=${value}, received ${body[key]}`,
      )
    }
  }
}

export const shapes = {
  // Exact static match, hits the matcher cache every time.
  static: {
    totalRequests: 208,
    fallback: false,
    options: jsonOptions,
    buildRequest: () =>
      new Request('http://localhost/api/health', jsonRequestInit),
    assert: (handler) => expectJson(handler, '/api/health', { ok: true }),
  },
  // Same route as the upstream `server-routes` scenario: a fresh param each
  // request, so the matcher cache misses every time.
  param: {
    totalRequests: 208,
    fallback: false,
    options: jsonOptions,
    buildRequest: (random) =>
      new Request(
        `http://localhost/api/users/${randomSegment(random)}`,
        jsonRequestInit,
      ),
    assert: (handler) =>
      expectJson(handler, '/api/users/sanity', { name: 'user-sanity' }),
  },
  // Three request middlewares up the branch: layout, route, handler.
  'nested-middleware': {
    totalRequests: 208,
    fallback: false,
    options: jsonOptions,
    buildRequest: (random) =>
      new Request(
        `http://localhost/api/admin/${randomSegment(random)}`,
        jsonRequestInit,
      ),
    assert: (handler) =>
      expectJson(handler, '/api/admin/sanity', { id: 'sanity', total: 6 }),
  },
  // 200 static siblings, requests spread across all of them.
  'many-routes': {
    totalRequests: 208,
    fallback: false,
    options: jsonOptions,
    buildRequest: (random) =>
      new Request(
        `http://localhost/api/many/r${Math.floor(random() * MANY_ROUTE_COUNT)}`,
        jsonRequestInit,
      ),
    assert: (handler) =>
      expectJson(handler, `/api/many/r${MANY_ROUTE_COUNT - 1}`, {
        n: MANY_ROUTE_COUNT - 1,
      }),
  },
  // A page request: the server-route fast path must miss at no extra cost.
  'page-fallback': {
    totalRequests: 48,
    fallback: true,
    options: fallbackOptions,
    buildRequest: () => new Request('http://localhost/', htmlRequestInit),
    assert: (handler) => expectHtml(handler, '/', 200, 'server routes matrix'),
  },
  // An unknown path under /api: the fast path misses, then the Router
  // renders its 404 page. The worst case for the miss.
  'api-miss': {
    totalRequests: 48,
    fallback: true,
    options: fallbackOptions,
    buildRequest: () =>
      new Request('http://localhost/api/does-not-exist', htmlRequestInit),
    validateResponse: (response, request) => {
      if (response.status !== 404) {
        throw new Error(
          `Expected 404, received ${response.status} (${request.url})`,
        )
      }
    },
    assert: (handler) =>
      expectHtml(handler, '/api/does-not-exist', 404, 'Not Found'),
  },
} satisfies Record<string, Shape>

export type ShapeName = keyof typeof shapes

export function runShapeLoop(handler: StartRequestHandler, shape: Shape) {
  return runRequestLoop(handler, {
    seed: benchmarkSeed,
    concurrency,
    totalRequests: shape.totalRequests,
    buildRequest: shape.buildRequest,
    validateResponse: shape.validateResponse,
  })
}

/**
 * Registers one benchmark per handler for a shape: the built Start app and,
 * for API shapes, a Hono reference serving the same route table.
 */
export async function defineShapeBenches(
  shapeName: ShapeName,
  appModuleUrl: string,
) {
  const shape: Shape = shapes[shapeName]
  const app = (await import(/* @vite-ignore */ appModuleUrl)) as {
    default: StartRequestHandler
  }
  const handlers: Array<[label: string, handler: StartRequestHandler]> = [
    ['start (react)', app.default],
  ]
  if (!shape.fallback) {
    handlers.push(['hono', honoApp])
  }
  for (const [label, handler] of handlers) {
    await shape.assert(handler)
    test(label, async ({ bench }) => {
      await bench(`ssr server-route ${shapeName} ${label}`, async () =>
        runShapeLoop(handler, shape),
      ).run(shape.options)
    })
  }
}
