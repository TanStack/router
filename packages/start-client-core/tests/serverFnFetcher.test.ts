import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serverFnFetcher } from '../src/client-rpc/serverFnFetcher'
import {
  TSS_FORMDATA_CONTEXT,
  X_TSS_RAW_RESPONSE,
  X_TSS_SERIALIZED,
} from '../src/constants'
import type { ServerFnCodec } from '../src/client-rpc/serverFnCodecLoader'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  options: vi.fn(),
  serialize: vi.fn(),
  deserialize: vi.fn(),
}))
vi.mock('#tanstack-start-server-fn-codec', () => ({
  serialize: mocks.serialize,
  deserialize: mocks.deserialize,
}))
vi.mock('../src/client-rpc/serverFnCodecLoader.lazy', () => ({
  loadServerFnCodec: mocks.load,
}))
vi.mock('../src/getStartOptions', () => ({ getStartOptions: mocks.options }))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function response() {
  return Response.json(
    { value: 'ok' },
    { headers: { [X_TSS_SERIALIZED]: 'true' } },
  )
}

describe('server function codec loading', () => {
  let codec: ServerFnCodec
  afterEach(() => {
    expect(mocks.serialize).not.toHaveBeenCalled()
    expect(mocks.deserialize).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
  beforeEach(() => {
    vi.stubEnv('TSS_SERVER_FN_TRANSPORT', 'lazy')
    vi.clearAllMocks()
    mocks.options.mockReturnValue(undefined)
    codec = {
      serialize: vi.fn(async (value) => JSON.stringify(value)),
      deserialize: vi.fn(async (res) => res.json()),
    }
    mocks.load.mockResolvedValue(codec)
  })

  it.each(['GET', 'POST'])(
    'dispatches a payload-free %s while the codec is loading',
    async (method) => {
      const loading = deferred<ServerFnCodec>()
      mocks.load.mockReturnValue(loading.promise)
      const fetch = vi.fn(async () => response())
      const result = serverFnFetcher('/fn', [{ method, context: {} }], fetch)
      expect(fetch).toHaveBeenCalledOnce()
      expect(codec.deserialize).not.toHaveBeenCalled()
      loading.resolve(codec)
      await expect(result).resolves.toEqual({ value: 'ok' })
    },
  )

  it.each(['GET', 'POST'])(
    'waits for codec and serialization before dispatching a %s payload',
    async (method) => {
      const loading = deferred<ServerFnCodec>()
      const encoding = deferred<string>()
      mocks.load.mockReturnValue(loading.promise)
      vi.mocked(codec.serialize).mockReturnValue(encoding.promise)
      const fetch = vi.fn(async () => response())
      const result = serverFnFetcher(
        '/fn?existing=1',
        [{ method, data: null, context: { token: 'context' } }],
        fetch,
      )
      expect(fetch).not.toHaveBeenCalled()
      loading.resolve(codec)
      await Promise.resolve()
      expect(codec.serialize).toHaveBeenCalledWith(
        { data: null, context: { token: 'context' } },
        undefined,
      )
      expect(fetch).not.toHaveBeenCalled()
      encoding.resolve('encoded')
      await result
      expect(fetch).toHaveBeenCalledOnce()
      const [url, init] = fetch.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ]
      if (method === 'GET') {
        expect(url).toBe('/fn?existing=1&payload=encoded')
        expect(init.body).toBeUndefined()
      } else {
        expect(init.body).toBe('encoded')
        expect(new Headers(init.headers).get('content-type')).toBe(
          'application/json',
        )
      }
    },
  )

  it.each([false, 0, ''])('serializes defined falsy data %j', async (data) => {
    await serverFnFetcher('/fn', [{ method: 'POST', data }], async () =>
      response(),
    )
    expect(codec.serialize).toHaveBeenCalledWith({ data }, undefined)
  })

  it('does not load or fetch with an already-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetch = vi.fn()
    await expect(
      serverFnFetcher(
        '/fn',
        [{ method: 'GET', signal: controller.signal }],
        fetch,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.load).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('serializes middleware context even when there is no data', async () => {
    const loading = deferred<ServerFnCodec>()
    mocks.load.mockReturnValue(loading.promise)
    const fetch = vi.fn(async () => response())
    const result = serverFnFetcher(
      '/fn',
      [{ method: 'GET', context: { user: 1 } }],
      fetch,
    )
    expect(fetch).not.toHaveBeenCalled()
    loading.resolve(codec)
    await result
    expect(codec.serialize).toHaveBeenCalledWith(
      { context: { user: 1 } },
      undefined,
    )
  })

  it('dispatches FormData without serialization when context is empty', async () => {
    const loading = deferred<ServerFnCodec>()
    mocks.load.mockReturnValue(loading.promise)
    const data = new FormData()
    data.set('name', 'value')
    const fetch = vi.fn(async () => response())
    const result = serverFnFetcher(
      '/fn',
      [{ method: 'POST', data, context: {} }],
      fetch,
    )
    expect(fetch).toHaveBeenCalledWith(
      '/fn',
      expect.objectContaining({ body: data }),
    )
    expect(codec.serialize).not.toHaveBeenCalled()
    loading.resolve(codec)
    await result
  })

  it('waits for serialized context before sending FormData', async () => {
    const loading = deferred<ServerFnCodec>()
    mocks.load.mockReturnValue(loading.promise)
    const data = new FormData()
    const fetch = vi.fn(async () => response())
    const result = serverFnFetcher(
      '/fn',
      [{ method: 'POST', data, context: { user: 1 } }],
      fetch,
    )
    expect(fetch).not.toHaveBeenCalled()
    expect(data.has(TSS_FORMDATA_CONTEXT)).toBe(false)
    loading.resolve(codec)
    await result
    expect(data.get(TSS_FORMDATA_CONTEXT)).toBe('{"user":1}')
    expect(codec.serialize).toHaveBeenCalledWith({ user: 1 }, undefined)
  })

  it('rejects GET FormData before loading the codec or sending a request', async () => {
    const fetch = vi.fn()
    await expect(
      serverFnFetcher('/fn', [{ method: 'GET', data: new FormData() }], fetch),
    ).rejects.toThrow('FormData is not supported')
    expect(mocks.load).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not dispatch after an abort during codec loading', async () => {
    const loading = deferred<ServerFnCodec>()
    mocks.load.mockReturnValue(loading.promise)
    const controller = new AbortController()
    const fetch = vi.fn()
    const result = serverFnFetcher(
      '/fn',
      [{ method: 'POST', data: 1, signal: controller.signal }],
      fetch,
    )
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled()
    expect(codec.serialize).not.toHaveBeenCalled()
    const other = serverFnFetcher('/fn', [{ method: 'GET' }], async () =>
      response(),
    )
    loading.resolve(codec)
    await expect(other).resolves.toEqual({ value: 'ok' })
  })

  it('observes early import failures and cancels the response without replaying the RPC', async () => {
    const loading = deferred<ServerFnCodec>()
    const rpc = deferred<Response>()
    mocks.load.mockReturnValue(loading.promise)
    const fetch = vi.fn(() => rpc.promise)
    const result = serverFnFetcher('/fn', [{ method: 'POST' }], fetch)
    const error = new Error('chunk unavailable')
    loading.reject(error)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const cancel = vi.fn()
    rpc.resolve(
      new Response(new ReadableStream({ cancel }), {
        headers: {
          'content-type': 'application/json',
          [X_TSS_SERIALIZED]: 'true',
        },
      }),
    )
    await expect(result).rejects.toBe(error)
    expect(cancel).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('aborts after headers without waiting for the shared codec import', async () => {
    const loading = deferred<ServerFnCodec>()
    mocks.load.mockReturnValue(loading.promise)
    const controller = new AbortController()
    const cancel = vi.fn()
    const res = new Response(new ReadableStream({ cancel }), {
      headers: {
        'content-type': 'application/json',
        [X_TSS_SERIALIZED]: 'true',
      },
    })
    const result = serverFnFetcher(
      '/fn',
      [{ method: 'GET', signal: controller.signal }],
      async () => res,
    )
    await Promise.resolve()
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(codec.deserialize).not.toHaveBeenCalled()
    loading.resolve(codec)
  })

  it('does not encode or send a payload when the import fails', async () => {
    const error = new Error('chunk unavailable')
    mocks.load.mockReturnValue(Promise.reject(error))
    const fetch = vi.fn()
    await expect(
      serverFnFetcher('/fn', [{ method: 'POST', data: 1 }], fetch),
    ).rejects.toBe(error)
    expect(codec.serialize).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns raw responses without waiting for the codec', async () => {
    mocks.load.mockReturnValue(new Promise(() => {}))
    const raw = new Response('raw', {
      headers: { [X_TSS_RAW_RESPONSE]: 'true' },
    })
    await expect(
      serverFnFetcher('/fn', [{ method: 'GET' }], async () => raw),
    ).resolves.toBe(raw)
  })

  it('preserves custom fetch, headers, signal, adapters, and thrown Responses', async () => {
    const adapters = []
    mocks.options.mockReturnValue({ serializationAdapters: adapters })
    const controller = new AbortController()
    const headers = new Headers({ authorization: 'test' })
    const custom = vi.fn(async () => {
      throw response()
    })
    const fallback = vi.fn()
    await expect(
      serverFnFetcher(
        '/fn',
        [{ method: 'GET', fetch: custom, headers, signal: controller.signal }],
        fallback,
      ),
    ).resolves.toEqual({ value: 'ok' })
    expect(fallback).not.toHaveBeenCalled()
    expect(headers.has('x-tsr-serverFn')).toBe(false)
    expect(custom).toHaveBeenCalledWith(
      '/fn',
      expect.objectContaining({ signal: controller.signal }),
    )
    expect(codec.deserialize).toHaveBeenCalledWith(
      expect.any(Response),
      'application/json',
      adapters,
      false,
      expect.any(Function),
    )
  })
})

describe('bundled codec specialization', () => {
  afterEach(() => vi.unstubAllEnvs())
  it.each([
    { method: 'GET' },
    { method: 'POST', data: { value: 'payload' } },
    { method: 'POST', data: new FormData(), context: { value: 'context' } },
  ])(
    'calls static codec functions without invoking the loader for $method',
    async (options) => {
      vi.stubEnv('TSS_SERVER_FN_TRANSPORT', 'bundled')
      vi.clearAllMocks()
      mocks.options.mockReturnValue(undefined)
      mocks.load.mockImplementation(() => {
        throw new Error('bundled must not load the lazy codec')
      })
      mocks.serialize.mockImplementation(async (value) => JSON.stringify(value))
      mocks.deserialize.mockImplementation(async (res) => res.json())
      const fetch = vi.fn(async () => response())
      await expect(serverFnFetcher('/fn', [options], fetch)).resolves.toEqual({
        value: 'ok',
      })
      expect(fetch).toHaveBeenCalledOnce()
      expect(mocks.load).not.toHaveBeenCalled()
      expect(mocks.deserialize).toHaveBeenCalledOnce()
    },
  )
})

describe.each(['bundled', 'lazy'] as const)(
  '%s synchronous fetch exceptions',
  (mode) => {
    afterEach(() => {
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    })
    beforeEach(() => {
      vi.stubEnv('TSS_SERVER_FN_TRANSPORT', mode)
      vi.clearAllMocks()
      mocks.options.mockReturnValue(undefined)
      mocks.deserialize.mockImplementation(async (res) => res.json())
      mocks.load.mockResolvedValue({
        serialize: mocks.serialize,
        deserialize: mocks.deserialize,
      })
    })
    it('decodes a synchronously thrown Response', async () => {
      await expect(
        serverFnFetcher('/fn', [{ method: 'GET' }], () => {
          throw response()
        }),
      ).resolves.toEqual({ value: 'ok' })
      expect(mocks.deserialize).toHaveBeenCalledOnce()
    })
    it('preserves a synchronously thrown Error and observes a later codec failure', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {})
      const loading = deferred<ServerFnCodec>()
      mocks.load.mockReturnValue(loading.promise)
      const error = new Error('fetch failed')
      await expect(
        serverFnFetcher('/fn', [{ method: 'GET' }], () => {
          throw error
        }),
      ).rejects.toBe(error)
      if (mode === 'lazy') {
        loading.reject(new Error('later import failure'))
        await Promise.resolve()
      }
      expect(mocks.deserialize).not.toHaveBeenCalled()
    })
  },
)

describe('lazy abort during serialization', () => {
  afterEach(() => vi.unstubAllEnvs())
  it.each(['GET', 'POST', 'FormData'])(
    'does not dispatch or mutate context after aborting %s encoding',
    async (method) => {
      vi.stubEnv('TSS_SERVER_FN_TRANSPORT', 'lazy')
      vi.clearAllMocks()
      mocks.options.mockReturnValue(undefined)
      const encoding = deferred<string>()
      const serialize = vi.fn(() => encoding.promise)
      mocks.load.mockResolvedValue({ serialize, deserialize: vi.fn() })
      const controller = new AbortController()
      const form = new FormData()
      const fetch = vi.fn(async () => response())
      const result = serverFnFetcher(
        '/fn',
        [
          {
            method: method === 'GET' ? 'GET' : 'POST',
            data: method === 'FormData' ? form : { value: 'payload' },
            context: { value: 'context' },
            signal: controller.signal,
          },
        ],
        fetch,
      )
      await vi.waitFor(() => expect(serialize).toHaveBeenCalledOnce())
      const reason = new Error('cancel encoding')
      controller.abort(reason)
      encoding.resolve('encoded')
      await expect(result).rejects.toBe(reason)
      expect(fetch).not.toHaveBeenCalled()
      expect(form.has(TSS_FORMDATA_CONTEXT)).toBe(false)
    },
  )
})
