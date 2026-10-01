import { describe, expect, it, vi } from 'vitest'
import { serverFnFetcher } from '../src/client-rpc/serverFnFetcher'

vi.mock('../src/getDefaultSerovalPlugins', () => ({
  getDefaultSerovalPlugins: () => [],
}))

describe('serverFnFetcher', () => {
  it('rejects non-ok JSON responses that were not serialized by Start', async () => {
    const body = {
      status: 500,
      unhandled: true,
      message: 'HTTPError',
    }

    const result = serverFnFetcher('/_serverFn/test', [{ method: 'GET' }], () =>
      Promise.resolve(Response.json(body, { status: 500 })),
    )

    await expect(result).rejects.toThrow(JSON.stringify(body))
  })

  it('returns ok JSON responses that were not serialized by Start', async () => {
    const body = { result: 'ok' }

    const result = serverFnFetcher('/_serverFn/test', [{ method: 'GET' }], () =>
      Promise.resolve(Response.json(body)),
    )

    await expect(result).resolves.toEqual(body)
  })
})
