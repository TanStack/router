import { afterEach, describe, expect, it, vi } from 'vitest'
import { serverFnFetcher } from '../src/client-rpc/serverFnFetcher'

describe('serverFnFetcher error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not log when the request is aborted, but still rethrows', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const abortError = new DOMException(
      'The operation was aborted',
      'AbortError',
    )
    const handler = vi.fn((): Promise<Response> => Promise.reject(abortError))

    await expect(serverFnFetcher('/_serverFn/test', [{}], handler)).rejects.toBe(
      abortError,
    )
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('logs and rethrows a genuine error', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = new Error('boom')
    const handler = vi.fn((): Promise<Response> => Promise.reject(error))

    await expect(serverFnFetcher('/_serverFn/test', [{}], handler)).rejects.toBe(
      error,
    )
    expect(logSpy).toHaveBeenCalledWith(error)
  })
})
