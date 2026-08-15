import { describe, expect, it } from 'vitest'
import {
  parseStartConfig,
  tanstackStartBunOptionsSchema,
} from '../src/bun/schema'

describe('bun parseStartConfig', () => {
  it('preserves router.autoCodeSplitting through getConfig', () => {
    const cfg = parseStartConfig(
      {
        router: { autoCodeSplitting: false },
        bun: { minify: true },
      },
      { framework: 'solid' },
      '/tmp/app',
    )
    expect(cfg.router.autoCodeSplitting).toBe(false)
  })

  it('accepts bun.minify and bun.port in the Bun schema', () => {
    const parsed = tanstackStartBunOptionsSchema.parse({
      bun: { minify: false, port: 4000 },
    })
    expect(parsed.bun?.minify).toBe(false)
    expect(parsed.bun?.port).toBe(4000)
  })
})
