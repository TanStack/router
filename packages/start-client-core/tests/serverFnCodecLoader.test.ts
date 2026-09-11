import { expect, it, vi } from 'vitest'

it('shares the real codec import across concurrent and later calls', async () => {
  vi.resetModules()
  const { loadServerFnCodec } =
    await import('../src/client-rpc/serverFnCodecLoader.lazy')
  const first = loadServerFnCodec()
  expect(loadServerFnCodec()).toBe(first)
  const codec = await first
  expect(codec.serialize).toBeTypeOf('function')
  expect(codec.deserialize).toBeTypeOf('function')
  expect(await loadServerFnCodec()).toBe(codec)
})

it('clears a failed import so a later call can retry and share the new promise', async () => {
  vi.resetModules()
  const failure = new Error('temporary chunk fetch failure')
  vi.doMock('../src/client-rpc/serverFnCodec', () => {
    throw failure
  })
  try {
    const { loadServerFnCodec } =
      await import('../src/client-rpc/serverFnCodecLoader.lazy')
    const first = loadServerFnCodec()
    expect(loadServerFnCodec()).toBe(first)
    // Vitest wraps errors thrown by mock module factories.
    await expect(first).rejects.toHaveProperty('cause', failure)

    // Simulate a retryable chunk-fetch failure becoming available. Keep the
    // same loader closure; resetting it would conceal a stuck pending promise.
    vi.doMock('../src/client-rpc/serverFnCodec', () => ({
      serialize: vi.fn(),
      deserialize: vi.fn(),
    }))
    const retry = loadServerFnCodec()
    expect(retry).not.toBe(first)
    expect(loadServerFnCodec()).toBe(retry)
    const codec = await retry
    expect(codec.serialize).toBeTypeOf('function')
    expect(await loadServerFnCodec()).toBe(codec)
  } finally {
    vi.doUnmock('../src/client-rpc/serverFnCodec')
    vi.resetModules()
  }
})
