import { describe, expect, test } from 'vitest'

import { getBundlerOptions, usesRolldown } from '../src/utils'

describe('usesRolldown', () => {
  test('uses rollup config keys on Vite 7', () => {
    expect(usesRolldown('7.3.1')).toBe(false)
  })

  test('uses rolldown config keys on Vite 8', () => {
    expect(usesRolldown('8.0.0')).toBe(true)
  })

  test('defaults to rollup config keys for unknown versions', () => {
    expect(usesRolldown('unknown')).toBe(false)
  })
})

describe('getBundlerOptions', () => {
  test('prefers rolldown options when present', () => {
    const rolldownOptions = { input: 'entry.ts' }

    expect(
      getBundlerOptions({
        rolldownOptions,
        rollupOptions: { input: 'legacy-entry.ts' },
      }),
    ).toBe(rolldownOptions)
  })

  test('falls back to rollup options', () => {
    const rollupOptions = { input: 'entry.ts' }

    expect(getBundlerOptions({ rollupOptions })).toBe(rollupOptions)
  })
})
