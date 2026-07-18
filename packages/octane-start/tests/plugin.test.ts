import { describe, expect, it } from 'vitest'
import { validateOctaneCompilerOptions } from '../src/plugin/validate-options'
import type { OctaneCompilerOptions } from '../src/plugin/vite'

describe('Octane compiler options', () => {
  it('accepts readonly renderer presets', () => {
    const options = {
      renderers: {
        registry: {
          three: {
            module: '@octanejs/three/renderer',
            target: 'universal',
            server: 'client-only',
            capabilities: ['visibility', 'portal'],
          },
        },
        rules: [{ include: '**/*.three.tsrx', renderer: 'three' }],
      },
    } as const satisfies OctaneCompilerOptions

    expect(options.renderers.rules[0].renderer).toBe('three')
  })

  it('rejects a forced Octane SSR compilation mode', () => {
    const options: OctaneCompilerOptions = {
      // @ts-expect-error Start owns the per-environment SSR mode.
      ssr: true,
    }

    expect(() => validateOctaneCompilerOptions(options)).toThrowError(
      '`octane.ssr` is not supported by TanStack Start',
    )
  })
})
