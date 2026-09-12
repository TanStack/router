import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TSS_SERVER_FUNCTION } from '../src/constants'

const serverFnFetcher = vi.fn(async (url: string, args: Array<unknown>) => ({
  url,
  args,
}))

vi.mock('../src/client-rpc/serverFnFetcher', () => ({
  serverFnFetcher: (url: string, args: Array<unknown>) =>
    serverFnFetcher(url, args),
}))

vi.mock('../src/getStartOptions', () => ({
  getStartOptions: () => undefined,
}))

describe('createRevivedClientRpc', () => {
  beforeEach(() => {
    vi.resetModules()
    serverFnFetcher.mockClear()
    process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  })

  it('loads the RPC client lazily when no server function stub was bundled', async () => {
    const { createRevivedClientRpc } =
      await import('../src/client-rpc/clientRpcRegistry')

    const fn = createRevivedClientRpc('abc')

    expect(fn.url).toBe('/_serverFn/abc')
    expect(fn.serverFnMeta).toEqual({ id: 'abc' })
    expect(fn[TSS_SERVER_FUNCTION]).toBe(true)
    expect(serverFnFetcher).not.toHaveBeenCalled()

    await expect(fn(1, 2)).resolves.toEqual({
      url: '/_serverFn/abc',
      args: [1, 2],
    })
    expect(serverFnFetcher).toHaveBeenCalledTimes(1)
  })

  it('uses the factory registered by the RPC client module when it is bundled', async () => {
    const { createRevivedClientRpc } =
      await import('../src/client-rpc/clientRpcRegistry')
    // Importing the module registers its factory, as compiled stubs do.
    const { createClientRpc } =
      await import('../src/client-rpc/createClientRpc')

    const revived = createRevivedClientRpc('abc')
    const direct = createClientRpc('abc')

    expect(revived.url).toBe(direct.url)
    expect(revived.serverFnMeta).toEqual(direct.serverFnMeta)
    await expect(revived('x')).resolves.toEqual({
      url: '/_serverFn/abc',
      args: ['x'],
    })
  })

  it('prefers an explicitly registered factory', async () => {
    const { createRevivedClientRpc, registerClientRpcFactory } =
      await import('../src/client-rpc/clientRpcRegistry')
    const custom = Object.assign(vi.fn(), {
      url: '/custom',
      serverFnMeta: { id: 'custom' },
      [TSS_SERVER_FUNCTION]: true as const,
    })
    registerClientRpcFactory(() => custom)

    expect(createRevivedClientRpc('ignored')).toBe(custom)
  })
})
