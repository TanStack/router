import { expectTypeOf, test } from 'vitest'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import { resolveSsrStreaming } from '../src/ssr/streaming'
import type { AnyRouter } from '../src'

declare const request: Request
declare const createRouter: () => AnyRouter

test('createRequestHandler accepts object streaming policy', () => {
  createRequestHandler({
    request,
    createRouter,
    ssr: {
      streaming: {
        render: true,
      },
    },
  })
})

test('createRequestHandler accepts explicit head streaming policy', () => {
  createRequestHandler({
    request,
    createRouter,
    ssr: {
      streaming: {
        render: false,
        head: true,
      },
    },
  })
})

test('createRequestHandler accepts streaming resolver', () => {
  createRequestHandler({
    request,
    createRouter,
    ssr: {
      streaming: async ({ request: req, router }) => {
        expectTypeOf(req).toEqualTypeOf<Request>()
        expectTypeOf(router).toEqualTypeOf<AnyRouter>()

        return {
          render: false,
        }
      },
    },
  })
})

test('createRequestHandler rejects invalid streaming values', () => {
  createRequestHandler({
    request,
    createRouter,
    ssr: {
      // @ts-expect-error
      streaming: true,
    },
  })

  createRequestHandler({
    request,
    createRouter,
    ssr: {
      // @ts-expect-error
      streaming: 'yes',
    },
  })

  createRequestHandler({
    request,
    createRouter,
    ssr: {
      streaming: {
        // @ts-expect-error
        rsc: true,
      },
    },
  })

  createRequestHandler({
    request,
    createRouter,
    ssr: {
      // @ts-expect-error
      streaming: {
        head: true,
      },
    },
  })

  createRequestHandler({
    request,
    createRouter,
    ssr: {
      streaming: {
        // @ts-expect-error
        render: 'stream',
      },
    },
  })

  createRequestHandler({
    request,
    createRouter,
    ssr: {
      // @ts-expect-error
      streaming: () => ({ head: false }),
    },
  })
})

test('resolveSsrStreaming accepts partial request overrides', () => {
  resolveSsrStreaming({
    request,
    router: createRouter(),
    streamingOverride: {
      head: true,
    },
  })

  resolveSsrStreaming({
    request,
    router: createRouter(),
    streamingOverride: {
      render: false,
      head: true,
    },
  })

  resolveSsrStreaming({
    request,
    router: createRouter(),
    streamingOverride: {
      // @ts-expect-error
      rsc: true,
    },
  })

  resolveSsrStreaming({
    request,
    router: createRouter(),
    streamingOverride: {
      // @ts-expect-error
      head: 'true',
    },
  })
})
