import { describe, expect, it } from 'vitest'
import { getStartContext, runWithStartContext } from '../src/native'

describe('native start storage', () => {
  it('has no context outside a run', () => {
    expect(getStartContext({ throwIfNotFound: false })).toBeUndefined()
    expect(() => getStartContext()).toThrow('No Start context found')
  })

  it('exposes the context inside a run and restores it afterwards', async () => {
    const context = { handlerType: 'serverFn' } as any
    const seen = await runWithStartContext(context, () => getStartContext())

    expect(seen).toBe(context)
    expect(getStartContext({ throwIfNotFound: false })).toBeUndefined()
  })
})
