/**
 * Not part of the compiler test corpus (implementation test, moved from
 * tests/rsbuild/plugin.test.ts by the final pass, FINAL-PASS #36): it calls
 * the internal `enableSwcReactServerComponents` (src/rsbuild/swc-rsc.ts),
 * the Rsbuild RSC configuration plumbing, on a hand-made Rspack config. No
 * compiler outcome: the Rsbuild RSC builds of react-start-rsc's integration
 * tier decide that RSC apps build.
 */
import { describe, expect, test } from 'vitest'
import { enableSwcReactServerComponents } from '../../src/rsbuild/swc-rsc'

describe('enableSwcReactServerComponents', () => {
  test('clones rspack rules without structuredClone so function fields survive', () => {
    const optionFn = () => 'kept'
    const ruleFn = () => true
    const config = {
      module: {
        rules: [
          {
            test: /\.[jt]sx?$/,
            issuer: ruleFn,
            use: [
              {
                loader: 'builtin:swc-loader',
                options: {
                  optionFn,
                },
              },
            ],
          },
        ],
      },
      resolve: {},
    } as any

    expect(() => {
      enableSwcReactServerComponents(config, 'rsc-subtree')
    }).not.toThrow()

    const oneOf = config.module.rules[0].oneOf
    expect(oneOf).toHaveLength(4)
    expect(oneOf[0].issuer).toBe(ruleFn)
    expect(oneOf[0].use[0].options.optionFn).toBe(optionFn)
    expect(
      oneOf[0].use[0].options.rspackExperiments.reactServerComponents,
    ).toEqual({})
    expect(oneOf[3].use[0].options.rspackExperiments).toBeUndefined()
  })
})
