import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createClientRpc } from '../src/client-rpc/createClientRpc'
import { TSS_SERVER_FUNCTION } from '../src/constants'

describe('createClientRpc', () => {
  const originalEnv = process.env.TSS_SERVER_FN_BASE

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.TSS_SERVER_FN_BASE = originalEnv
    } else {
      delete process.env.TSS_SERVER_FN_BASE
    }
  })

  it('uses process.env.TSS_SERVER_FN_BASE when defined', () => {
    process.env.TSS_SERVER_FN_BASE = '/custom-base/'
    const rpc = createClientRpc('testFn')

    expect(rpc.url).toBe('/custom-base/testFn')
    expect(rpc.serverFnMeta).toEqual({ id: 'testFn' })
    expect(rpc[TSS_SERVER_FUNCTION]).toBe(true)
  })

  it('falls back to default server function base when TSS_SERVER_FN_BASE is undefined', () => {
    delete process.env.TSS_SERVER_FN_BASE
    const rpc = createClientRpc('testFn')

    expect(rpc.url).toBe('/_serverFn/testFn')
  })

  it('safely falls back without ReferenceError when global process is undefined', () => {
    const originalProcess = globalThis.process
    try {
      // @ts-expect-error simulating browser environment where process is not defined
      delete globalThis.process

      const rpc = createClientRpc('testFn')
      expect(rpc.url).toBe('/_serverFn/testFn')
    } finally {
      globalThis.process = originalProcess
    }
  })
})
