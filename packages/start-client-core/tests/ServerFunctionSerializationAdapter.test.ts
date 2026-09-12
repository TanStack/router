import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TSS_CLIENT_RPC, TSS_SERVER_FUNCTION } from '../src/constants'

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

describe('ServerFunctionSerializationAdapter', () => {
  beforeEach(() => {
    vi.resetModules()
    serverFnFetcher.mockClear()
    delete (globalThis as any)[TSS_CLIENT_RPC]
    process.env.TSS_SERVER_FN_BASE = '/_serverFn/'
  })

  it('revives a reference that reports the missing client only when called', async () => {
    const { ServerFunctionSerializationAdapter } =
      await import('../src/client/ServerFunctionSerializationAdapter')

    const fn = ServerFunctionSerializationAdapter.fromSerializable({
      functionId: 'abc',
    })

    expect(typeof fn).toBe('function')
    expect(() => fn(1)).toThrow(/No client bundled for server function abc/)
    expect(serverFnFetcher).not.toHaveBeenCalled()
  })

  it('revives a live RPC once the client RPC module is bundled', async () => {
    const { ServerFunctionSerializationAdapter } =
      await import('../src/client/ServerFunctionSerializationAdapter')
    // Compiled server function stubs import this module.
    const { createClientRpc } =
      await import('../src/client-rpc/createClientRpc')

    const revived = ServerFunctionSerializationAdapter.fromSerializable({
      functionId: 'abc',
    })
    const direct = createClientRpc('abc')

    expect(revived.url).toBe(direct.url)
    expect(revived.serverFnMeta).toEqual(direct.serverFnMeta)
    expect(revived[TSS_SERVER_FUNCTION]).toBe(true)
    await expect(revived(1, 2)).resolves.toEqual({
      url: '/_serverFn/abc',
      args: [1, 2],
    })
    expect(serverFnFetcher).toHaveBeenCalledTimes(1)
  })

  it('serializes revived references back to their function id', async () => {
    const { ServerFunctionSerializationAdapter } =
      await import('../src/client/ServerFunctionSerializationAdapter')
    await import('../src/client-rpc/createClientRpc')

    const revived = ServerFunctionSerializationAdapter.fromSerializable({
      functionId: 'abc',
    })

    expect(ServerFunctionSerializationAdapter.test(revived)).toBe(true)
    expect(ServerFunctionSerializationAdapter.toSerializable(revived)).toEqual({
      functionId: 'abc',
    })
  })
})
