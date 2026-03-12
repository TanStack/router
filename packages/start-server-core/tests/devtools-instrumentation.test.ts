import { describe, expect, it, vi } from 'vitest'
import { instrumentMiddlewareArray } from '../src/devtools-instrumentation'

describe('instrumentMiddlewareArray', () => {
  it('returns a wrapped array of the same length', () => {
    const mws = [vi.fn(), vi.fn(), vi.fn()]
    const chain: Array<{ name: string; startTime: number; endTime: number }> =
      []
    const wrapped = instrumentMiddlewareArray(mws, chain)
    expect(wrapped).toHaveLength(3)
  })

  it('calls original middleware with the same ctx and returns its result', async () => {
    const original = vi.fn().mockResolvedValue({ data: 42 })
    const chain: Array<{ name: string; startTime: number; endTime: number }> =
      []
    const [wrapped] = instrumentMiddlewareArray([original], chain)

    const ctx = { request: 'test', next: vi.fn() }
    const result = await wrapped!(ctx)

    expect(original).toHaveBeenCalledWith(ctx)
    expect(result).toEqual({ data: 42 })
  })

  it('records timing entries in the chain array', async () => {
    const mw1 = vi.fn().mockResolvedValue(undefined)
    const mw2 = vi.fn().mockResolvedValue(undefined)
    const chain: Array<{ name: string; startTime: number; endTime: number }> =
      []
    const wrapped = instrumentMiddlewareArray([mw1, mw2], chain)

    await wrapped[0]!({})
    await wrapped[1]!({})

    expect(chain).toHaveLength(2)
    expect(chain[0]!.name).toBe('middleware-0')
    expect(chain[1]!.name).toBe('middleware-1')
    expect(chain[0]!.startTime).toBeLessThanOrEqual(chain[0]!.endTime)
    expect(chain[1]!.startTime).toBeLessThanOrEqual(chain[1]!.endTime)
  })

  it('preserves named middleware function names', async () => {
    function authMiddleware(_ctx: any) {
      return Promise.resolve()
    }
    const chain: Array<{ name: string; startTime: number; endTime: number }> =
      []
    const wrapped = instrumentMiddlewareArray([authMiddleware], chain)

    await wrapped[0]!({})

    expect(chain[0]!.name).toBe('authMiddleware')
    expect(wrapped[0]!.name).toBe('authMiddleware')
  })

  it('records timing even when middleware throws', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('boom'))
    const chain: Array<{ name: string; startTime: number; endTime: number }> =
      []
    const [wrapped] = instrumentMiddlewareArray([failing], chain)

    await expect(wrapped!({})).rejects.toThrow('boom')
    expect(chain).toHaveLength(1)
    expect(chain[0]!.endTime).toBeGreaterThanOrEqual(chain[0]!.startTime)
  })

  it('returns empty array for empty input', () => {
    const chain: Array<{ name: string; startTime: number; endTime: number }> =
      []
    const wrapped = instrumentMiddlewareArray([], chain)
    expect(wrapped).toHaveLength(0)
  })
})
