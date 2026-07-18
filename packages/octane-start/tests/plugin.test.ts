import { describe, expect, it } from 'vitest'
import { validateOctaneCompilerOptions } from '../src/plugin/validate-options'
import type { OctaneCompilerOptions } from '../src/plugin/vite'

describe('Octane compiler options', () => {
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
