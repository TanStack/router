import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TSS_FORMDATA_CONTEXT,
  X_TSS_SERIALIZED,
} from '@tanstack/start-client-core'

/**
 * Tests for the untrusted-payload handling in handleServerAction.
 *
 * The server functions handler deserializes attacker-controlled request
 * bodies (seroval.fromJSON over JSON from the query string, POST body or
 * multipart form data). These tests pin the contract:
 * - oversized GET payloads are rejected before reaching the server function
 * - malformed payloads produce an error response, never a crash
 * - the server function's declared HTTP method is enforced before parsing
 * - server context always wins over client-supplied context
 * - malformed FormData context falls back to base context instead of failing
 */

const mockAction = vi.fn(async (params: any) => ({
  ok: true,
  echo: params?.data ?? null,
}))

vi.mock('#tanstack-start-server-fn-resolver', () => ({
  getServerFnById: () => mockAction,
}))

import { toJSONAsync } from 'seroval'
import { handleServerAction } from '../src/server-functions-handler'
import { runWithStartContext } from '@tanstack/start-storage-context'
import type { StartStorageContext } from '@tanstack/start-storage-context'

// handleServerAction reads response state from the request/response
// AsyncLocalStorage (global symbol) and options from the start storage
// context. Provide minimal versions of both.
const EVENT_STORAGE_KEY = Symbol.for('tanstack-start:event-storage')
const eventStorage = (globalThis as any)[EVENT_STORAGE_KEY] as
  | AsyncLocalStorage<{ h3Event: any }>
  | undefined

const fakeH3Event = {
  res: {
    status: undefined as number | undefined,
    statusText: '',
    headers: new Headers(),
  },
}

const fakeStartContext = {
  getRouter: () => {
    throw new Error('not needed in this test')
  },
  request: new Request('http://localhost/'),
  startOptions: { serializationAdapters: [] },
  contextAfterGlobalMiddlewares: {},
  executedRequestMiddlewares: new Set(),
  handlerType: 'serverFn',
} as unknown as StartStorageContext

async function withStartContext<T>(fn: () => Promise<T>): Promise<T> {
  if (!eventStorage) throw new Error('Start event storage not initialized')
  return runWithStartContext(fakeStartContext, () =>
    eventStorage.run({ h3Event: fakeH3Event }, fn),
  )
}

beforeEach(() => {
  mockAction.mockClear()
  mockAction.mockImplementation(async (params: any) => ({
    ok: true,
    echo: params?.data ?? null,
  }))
  delete (mockAction as any).method
  fakeH3Event.res.status = undefined
})

describe('handleServerAction payload hardening', () => {
  it('rejects oversized GET payloads without invoking the server function', async () => {
    await withStartContext(async () => {
      const oversized = 'x'.repeat(1_000_001)
      const url = new URL('http://localhost/_serverFn/x')
      url.searchParams.set('payload', JSON.stringify({ data: oversized }))
      const request = new Request(url, {
        method: 'GET',
        headers: { 'x-tsr-serverFn': 'true' },
      })

      const res = await handleServerAction({
        request,
        context: {},
        serverFnId: 'test',
      })

      expect(mockAction).not.toHaveBeenCalled()
      expect(res).toBeInstanceOf(Response)
      expect(res!.status).toBe(500)
    })
  })

  it('parses valid GET payloads and merges server context over client context', async () => {
    await withStartContext(async () => {
      const url = new URL('http://localhost/_serverFn/x')
      // the client sends seroval JSON, not plain JSON - mirror that here
      const payload = JSON.stringify(
        await toJSONAsync({ data: 42, context: { c: 'client' } }),
      )
      url.searchParams.set('payload', payload)
      const request = new Request(url, {
        method: 'GET',
        headers: { 'x-tsr-serverFn': 'true' },
      })

      const res = await handleServerAction({
        request,
        context: { c: 'server', s: true },
        serverFnId: 'test',
      })

      expect(res!.status).toBe(200)
      expect(res!.headers.get(X_TSS_SERIALIZED)).toBe('true')
      const params = mockAction.mock.calls[0]![0]
      expect(params.data).toBe(42)
      expect(params.context).toEqual({ c: 'server', s: true })
      expect(params.method).toBe('GET')
    })
  })

  it('malformed GET payload JSON produces an error response, not a crash', async () => {
    await withStartContext(async () => {
      const url = new URL('http://localhost/_serverFn/x')
      url.searchParams.set('payload', '{"data": not-json}')
      const request = new Request(url, {
        method: 'GET',
        headers: { 'x-tsr-serverFn': 'true' },
      })

      const res = await handleServerAction({
        request,
        context: {},
        serverFnId: 'test',
      })
      expect(mockAction).not.toHaveBeenCalled()
      expect(res!.status).toBe(500)
    })
  })

  it('malformed POST JSON body produces an error response', async () => {
    await withStartContext(async () => {
      const request = new Request('http://localhost/_serverFn/x', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tsr-serverFn': 'true',
        },
        body: '{invalid',
      })

      const res = await handleServerAction({
        request,
        context: {},
        serverFnId: 'test',
      })
      expect(mockAction).not.toHaveBeenCalled()
      expect(res!.status).toBe(500)
    })
  })

  it('round-trips POST JSON payloads through seroval', async () => {
    await withStartContext(async () => {
      const request = new Request('http://localhost/_serverFn/x', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tsr-serverFn': 'true',
        },
        body: JSON.stringify(
          await toJSONAsync({ data: { nested: [1, 'two', null] } }),
        ),
      })

      const res = await handleServerAction({
        request,
        context: {},
        serverFnId: 'test',
      })
      expect(res!.status).toBe(200)
      const params = mockAction.mock.calls[0]![0]
      expect(params.data).toEqual({ nested: [1, 'two', null] })
    })
  })

  it('rejects requests whose method mismatches the declared fn method before parsing', async () => {
    await withStartContext(async () => {
      ;(mockAction as any).method = 'POST'

      // an oversized payload would also fail, but the 405 must win by arriving first
      const url = new URL('http://localhost/_serverFn/x')
      url.searchParams.set('payload', 'x'.repeat(1_000_001))
      const request = new Request(url, { method: 'GET' })

      const res = await handleServerAction({
        request,
        context: {},
        serverFnId: 'test',
      })
      expect(res!.status).toBe(405)
      expect(res!.headers.get('Allow')).toBe('POST')
      expect(mockAction).not.toHaveBeenCalled()
    })
  })

  it('malformed FormData context falls back to base context', async () => {
    await withStartContext(async () => {
      const form = new FormData()
      form.append(TSS_FORMDATA_CONTEXT, '{broken json')
      form.append('data', 'hello')

      // note: do not set Content-Type manually - the boundary must come from
      // the Request's own FormData serialization
      const request = new Request('http://localhost/_serverFn/x', {
        method: 'POST',
        headers: { 'x-tsr-serverFn': 'true' },
        body: form,
      })

      await handleServerAction({
        request,
        context: { base: true },
        serverFnId: 'test',
      })

      const params = mockAction.mock.calls[0]![0]
      expect(params.data.get('data')).toBe('hello')
      expect(params.context).toEqual({ base: true })
    })
  })

  it('client-supplied object context never overrides server context keys', async () => {
    await withStartContext(async () => {
      const form = new FormData()
      form.append(
        TSS_FORMDATA_CONTEXT,
        JSON.stringify(await toJSONAsync({ evil: 'yes', keep: 1 })),
      )
      form.append('data', 'hello')

      const request = new Request('http://localhost/_serverFn/x', {
        method: 'POST',
        headers: { 'x-tsr-serverFn': 'true' },
        body: form,
      })

      await handleServerAction({
        request,
        context: { evil: 'no' },
        serverFnId: 'test',
      })

      const params = mockAction.mock.calls[0]![0]
      expect(params.context.evil).toBe('no')
      expect(params.context.keep).toBe(1)
      expect(params.context.base).toBeUndefined()
    })
  })
})
