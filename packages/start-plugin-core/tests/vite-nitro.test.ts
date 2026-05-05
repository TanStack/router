import { describe, expect, it } from 'vitest'
import { hasNitroPlugin } from '../src/vite/nitro'

describe('hasNitroPlugin', () => {
  it('detects Nitro Vite plugin entries', () => {
    expect(hasNitroPlugin([{ name: 'nitro:env' }])).toBe(true)
  })

  it('detects nested Nitro Vite plugin entries', () => {
    expect(hasNitroPlugin([[{ name: 'nitro:env' }]])).toBe(true)
  })

  it('ignores non-Nitro plugins', () => {
    expect(hasNitroPlugin([{ name: 'vite:react' }])).toBe(false)
  })
})
