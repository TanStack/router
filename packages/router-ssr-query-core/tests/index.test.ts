import { QueryClient } from '@tanstack/query-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupCoreRouterSsrQueryIntegration } from '../src'

type TestRouter = {
  isServer: boolean
  options: {
    dehydrate?: () => unknown | Promise<unknown>
    hydrate?: (dehydrated: any) => unknown | Promise<unknown>
  }
  serverSsr?: {
    isDehydrated: () => boolean
    onRenderFinished: (listener: () => void) => void
  }
}

function createServerRouter(): {
  router: TestRouter
  finishRender: () => void
  setDehydrated: (value: boolean) => void
} {
  const renderFinishedListeners = new Array<() => void>()
  let dehydrated = false

  return {
    router: {
      isServer: true,
      options: {},
      serverSsr: {
        isDehydrated: () => dehydrated,
        onRenderFinished: (listener) => {
          renderFinishedListeners.push(listener)
        },
      },
    },
    finishRender: () => {
      renderFinishedListeners.splice(0).forEach((listener) => listener())
    },
    setDehydrated: (value) => {
      dehydrated = value
    },
  }
}

async function readStream<T>(stream: ReadableStream<T>): Promise<Array<T>> {
  const reader = stream.getReader()
  const chunks = new Array<T>()

  while (true) {
    const result = await reader.read()

    if (result.done) {
      return chunks
    }

    chunks.push(result.value)
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return {
    promise,
    resolve,
  }
}

function createDehydratedQueryState(data: string) {
  return {
    data,
    dataUpdateCount: 1,
    dataUpdatedAt: 1,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    fetchStatus: 'idle' as const,
    isInvalidated: false,
    status: 'success' as const,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('setupCoreRouterSsrQueryIntegration', () => {
  it('uses custom dehydrate options for the initial payload and streamed queries', async () => {
    const queryClient = new QueryClient()
    const { router, finishRender, setDehydrated } = createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
      dehydrateOptions: {
        serializeData: (data) => `${data}-serialized`,
        shouldDehydrateQuery: (query) => query.queryKey[0] !== 'skip',
      },
    })

    queryClient.setQueryData(['include'], 'initial')
    queryClient.setQueryData(['skip'], 'ignored')

    const dehydrated = (await router.options.dehydrate?.()) as {
      dehydratedQueryClient?: {
        queries: Array<{ queryKey: Array<unknown>; state: { data: unknown } }>
      }
      queryStream: ReadableStream<{
        queries: Array<{ queryKey: Array<unknown>; state: { data: unknown } }>
      }>
    }

    expect(dehydrated.dehydratedQueryClient?.queries).toHaveLength(1)
    expect(dehydrated.dehydratedQueryClient?.queries[0]?.queryKey).toEqual([
      'include',
    ])
    expect(dehydrated.dehydratedQueryClient?.queries[0]?.state.data).toBe(
      'initial-serialized',
    )

    const streamedQueriesPromise = readStream(dehydrated.queryStream)
    const includedDeferred = createDeferred<string>()
    const skippedDeferred = createDeferred<string>()

    setDehydrated(true)
    const includedPromise = queryClient.fetchQuery({
      queryKey: ['streamed'],
      queryFn: () => includedDeferred.promise,
    })
    const skippedPromise = queryClient.fetchQuery({
      queryKey: ['skip'],
      queryFn: () => skippedDeferred.promise,
    })

    await Promise.resolve()
    includedDeferred.resolve('next')
    skippedDeferred.resolve('still-ignored')
    await Promise.all([includedPromise, skippedPromise])
    finishRender()

    const streamedQueries = await streamedQueriesPromise

    expect(streamedQueries).toHaveLength(1)
    expect(streamedQueries[0]?.queries).toHaveLength(1)
    expect(streamedQueries[0]?.queries[0]?.queryKey).toEqual(['streamed'])
    expect(streamedQueries[0]?.queries[0]?.state.data).toBe('next-serialized')
  })

  it('uses custom hydrate options for the initial payload and streamed queries', async () => {
    const queryClient = new QueryClient()
    const router: TestRouter = {
      isServer: false,
      options: {},
    }

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
      hydrateOptions: {
        defaultOptions: {
          deserializeData: (data) => `${String(data)}-hydrated`,
        },
      },
    })

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({
          mutations: [],
          queries: [
            {
              queryHash: '["streamed"]',
              queryKey: ['streamed'],
              state: createDehydratedQueryState('stream'),
            },
          ],
        })
        controller.close()
      },
    })

    await router.options.hydrate?.({
      dehydratedQueryClient: {
        mutations: [],
        queries: [
          {
            queryHash: '["initial"]',
            queryKey: ['initial'],
            state: createDehydratedQueryState('initial'),
          },
        ],
      },
      queryStream: stream,
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(queryClient.getQueryData(['initial'])).toBe('initial-hydrated')
    expect(queryClient.getQueryData(['streamed'])).toBe('stream-hydrated')
  })
})
