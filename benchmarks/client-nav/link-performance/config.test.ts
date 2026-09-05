import { afterEach, describe, expect, test, vi } from 'vitest'
import { createLinkPerformanceConfig } from './config'

afterEach(() => vi.unstubAllEnvs())

describe.each(['client', 'ssr'] as const)(
  '%s opt-in configuration',
  (target) => {
    test.each([undefined, '', '0', 'false'])(
      'does not discover benchmarks with TSR_LINK_PERF=%s',
      (value) => {
        vi.stubEnv('TSR_LINK_PERF', value)
        const config = createLinkPerformanceConfig(target)
        expect(config.test?.benchmark?.include).toEqual([])
        expect(config.test?.passWithNoTests).toBe(true)
      },
    )

    test('discovers only the requested suite when explicitly enabled', () => {
      vi.stubEnv('TSR_LINK_PERF', '1')
      const config = createLinkPerformanceConfig(target)
      expect(config.test?.benchmark?.include).toEqual([`${target}.bench.ts`])
      expect(config.test?.passWithNoTests).toBe(false)
    })

    test('builds production code for the correct environment', () => {
      const config = createLinkPerformanceConfig(target)
      expect(config.define?.['process.env.NODE_ENV']).toBe('"production"')
      expect(config.resolve?.conditions).toContain(
        target === 'ssr' ? 'node' : 'browser',
      )
      expect(config.build?.ssr).toBe(target === 'ssr')
      expect(config.build?.outDir).toBe(`./dist/${target}`)
      expect(config.build?.rolldownOptions?.platform).toBe('node')
      expect(config.build?.rolldownOptions?.external).toEqual([
        'node:module',
        'module',
        /^react(?:\/|$)/,
        /^react-dom(?:\/|$)/,
      ])
    })

    test('does not retransform built bundles in the test environment', () => {
      vi.stubEnv('VITEST', 'true')
      const config = createLinkPerformanceConfig(target)
      expect(config.ssr?.noExternal).toBeUndefined()
      expect(config.test?.server?.deps?.external).toEqual([
        /\/link-performance\/dist\//,
      ])
    })

    test('bundles router dependencies when building app snapshots', () => {
      vi.stubEnv('VITEST', undefined)
      expect(createLinkPerformanceConfig(target).ssr?.noExternal).toBe(true)
    })
  },
)
