import { describe, expect, test } from 'vitest'
import { version as viteVersion } from 'vite'
import { assertSupportedViteVersion } from '../../src/vite/vite-version'

describe('assertSupportedViteVersion', () => {
  test.each(['6.4.3', '6.0.0', '5.4.11', '4.5.0'])(
    'throws for unsupported Vite v%s',
    (version) => {
      expect(() => assertSupportedViteVersion(version)).toThrowError(
        `TanStack Start requires Vite v7.0.0 or newer, but Vite v${version} was detected.`,
      )
    },
  )

  test('mentions the silently skipped buildApp hook and the upgrade path', () => {
    expect(() => assertSupportedViteVersion('6.4.3')).toThrowError(
      /`buildApp` plugin hook.*SPA shell generation.*upgrade the "vite" dependency to >=7\.0\.0/s,
    )
  })

  test.each(['7.0.0', '7.2.4', '8.0.0', '8.0.0-beta.1'])(
    'accepts supported Vite v%s',
    (version) => {
      expect(() => assertSupportedViteVersion(version)).not.toThrow()
    },
  )

  test('does not throw for an unparseable version string', () => {
    expect(() => assertSupportedViteVersion('unknown')).not.toThrow()
  })

  test('accepts the Vite version installed in this workspace', () => {
    expect(() => assertSupportedViteVersion(viteVersion)).not.toThrow()
  })
})
