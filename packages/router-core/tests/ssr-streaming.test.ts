import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import {
  resolveSsrStreaming,
  shouldStreamSsrChannel,
} from '../src/ssr/streaming'
import { createTestRouter } from './routerTestUtils'

const HUMAN_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'
const BOT_UA = 'Mozilla/5.0 compatible Googlebot/2.1'

function makeRequest(userAgent = HUMAN_UA) {
  return new Request('http://localhost/', {
    headers: {
      'user-agent': userAgent,
    },
  })
}

function makeRouter() {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })

  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as Promise<unknown>).then === 'function',
  )
}

describe('resolveSsrStreaming', () => {
  test('default policy: human UA streams render and leaves head off', () => {
    const streaming = resolveSsrStreaming({
      request: makeRequest(HUMAN_UA),
      router: makeRouter(),
    })

    expect(isPromiseLike(streaming)).toBe(false)
    expect(streaming).toEqual({ render: true, head: false })
  })

  test('default policy: bot UA blocks render and leaves head off', () => {
    const streaming = resolveSsrStreaming({
      request: makeRequest(BOT_UA),
      router: makeRouter(),
    })

    expect(streaming).toEqual({ render: false, head: false })
  })

  test('object config requires render and defaults head to false', async () => {
    const streaming = await resolveSsrStreaming({
      request: makeRequest(BOT_UA),
      router: makeRouter(),
      streaming: {
        render: true,
      },
    })

    expect(shouldStreamSsrChannel(streaming, 'render')).toBe(true)
    expect(shouldStreamSsrChannel(streaming, 'head')).toBe(false)
  })

  test('object config can opt into head streaming explicitly', async () => {
    const streaming = await resolveSsrStreaming({
      request: makeRequest(HUMAN_UA),
      router: makeRouter(),
      streaming: {
        render: false,
        head: true,
      },
    })

    expect(shouldStreamSsrChannel(streaming, 'render')).toBe(false)
    expect(shouldStreamSsrChannel(streaming, 'head')).toBe(true)
  })

  test('resolver receives request and router', async () => {
    const router = makeRouter()
    const request = makeRequest(HUMAN_UA)
    const resolver = vi.fn(() => ({ render: true }))

    await resolveSsrStreaming({
      request,
      router,
      streaming: resolver,
    })

    expect(resolver).toHaveBeenCalledWith({
      request,
      router,
    })
  })

  test('resolver returning undefined uses the built-in default policy', async () => {
    const streaming = await resolveSsrStreaming({
      request: makeRequest(BOT_UA),
      router: makeRouter(),
      streaming: () => undefined,
    })

    expect(streaming).toEqual({ render: false, head: false })
  })

  test('async resolver is awaited', async () => {
    const streaming = await resolveSsrStreaming({
      request: makeRequest(HUMAN_UA),
      router: makeRouter(),
      streaming: async () => ({ render: false, head: true }),
    })

    expect(streaming).toEqual({ render: false, head: true })
  })

  test('request override patches the resolved policy', async () => {
    const streaming = await resolveSsrStreaming({
      request: makeRequest(BOT_UA),
      router: makeRouter(),
      streaming: {
        render: true,
      },
      streamingOverride: {
        head: true,
      },
    })

    expect(streaming).toEqual({ render: true, head: true })
  })

  test('request override can preserve the default render decision', async () => {
    const streaming = await resolveSsrStreaming({
      request: makeRequest(BOT_UA),
      router: makeRouter(),
      streamingOverride: {
        head: true,
      },
    })

    expect(streaming).toEqual({ render: false, head: true })
  })

  test('request override can replace render after async resolution', async () => {
    const streaming = await resolveSsrStreaming({
      request: makeRequest(BOT_UA),
      router: makeRouter(),
      streaming: async () => ({ render: false }),
      streamingOverride: {
        render: true,
      },
    })

    expect(streaming).toEqual({ render: true, head: false })
  })

  test('boolean streaming values are rejected', () => {
    expect(() =>
      resolveSsrStreaming({
        request: makeRequest(HUMAN_UA),
        router: makeRouter(),
        streaming: true as any,
      }),
    ).toThrow('Invalid ssr.streaming value')
  })

  test('unknown config options are rejected', () => {
    expect(() =>
      resolveSsrStreaming({
        request: makeRequest(HUMAN_UA),
        router: makeRouter(),
        streaming: {
          render: false,
          rsc: true,
        } as any,
      }),
    ).toThrow('Unknown ssr.streaming option "rsc"')
  })

  test('unknown runtime channel reads are rejected', async () => {
    const streaming = await resolveSsrStreaming({
      request: makeRequest(HUMAN_UA),
      router: makeRouter(),
      streaming: {
        render: false,
      },
    })

    expect(() => shouldStreamSsrChannel(streaming, 'toString' as any)).toThrow(
      'Unknown ssr.streaming channel "toString"',
    )
  })

  test('invalid object values throw instead of becoming truthy policy', () => {
    expect(() =>
      resolveSsrStreaming({
        request: makeRequest(HUMAN_UA),
        router: makeRouter(),
        streaming: {
          render: 'false',
        } as any,
      }),
    ).toThrow('Expected a boolean')

    expect(() =>
      resolveSsrStreaming({
        request: makeRequest(HUMAN_UA),
        router: makeRouter(),
        streaming: {
          head: false,
        } as any,
      }),
    ).toThrow('Invalid ssr.streaming value for "render"')
  })

  test('invalid request override values throw', () => {
    expect(() =>
      resolveSsrStreaming({
        request: makeRequest(HUMAN_UA),
        router: makeRouter(),
        streamingOverride: true as any,
      }),
    ).toThrow('Invalid ssr.streaming override value')

    expect(() =>
      resolveSsrStreaming({
        request: makeRequest(HUMAN_UA),
        router: makeRouter(),
        streamingOverride: {
          rsc: true,
        } as any,
      }),
    ).toThrow('Unknown ssr.streaming option "rsc"')

    expect(() =>
      resolveSsrStreaming({
        request: makeRequest(HUMAN_UA),
        router: makeRouter(),
        streamingOverride: {
          head: 'true',
        } as any,
      }),
    ).toThrow('Expected a boolean')
  })
})
