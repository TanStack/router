import { describe, expect, it } from 'vitest'
import { stringifySearchValue } from '../src/BaseTanStackRouterDevtoolsPanel'

describe('stringifySearchValue', () => {
  it('serializes plain search params like JSON.stringify', () => {
    const search = { id: 1, nested: { ok: true }, tags: ['a', 'b'] }
    expect(stringifySearchValue(search)).toBe(JSON.stringify(search))
  })

  it('does not throw on bigint values and serializes them deterministically', () => {
    const search = { id: 9007199254740993n, nested: { deep: 42n } }
    expect(() => stringifySearchValue(search)).not.toThrow()
    expect(stringifySearchValue({ id: 1n })).toBe(
      stringifySearchValue({ id: 1n }),
    )
    // Two searches differing only in bigint value must compare unequal.
    expect(stringifySearchValue({ id: 1n })).not.toBe(
      stringifySearchValue({ id: 2n }),
    )
  })
})
