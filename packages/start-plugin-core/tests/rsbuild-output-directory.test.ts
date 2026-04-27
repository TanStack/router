import { describe, expect, test } from 'vitest'
import { resolveRsbuildOutputDirectory } from '../src/rsbuild/planning'

describe('resolveRsbuildOutputDirectory', () => {
  test('uses explicit environment distPath string', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: 'custom/client',
        rootDistPath: 'build',
        fallback: 'dist/client',
        subdirectory: 'client',
      }),
    ).toBe('custom/client')
  })

  test('uses explicit environment distPath root object', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: { root: 'custom/server' },
        rootDistPath: { root: 'build' },
        fallback: 'dist/server',
        subdirectory: 'server',
      }),
    ).toBe('custom/server')
  })

  test('derives environment directory from top-level string distPath', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: undefined,
        rootDistPath: 'build',
        fallback: 'dist/client',
        subdirectory: 'client',
      }),
    ).toBe('build/client')
  })

  test('derives environment directory from top-level root distPath object', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: undefined,
        rootDistPath: { root: 'build' },
        fallback: 'dist/server',
        subdirectory: 'server',
      }),
    ).toBe('build/server')
  })

  test('falls back to default directory when no distPath is configured', () => {
    expect(
      resolveRsbuildOutputDirectory({
        distPath: undefined,
        rootDistPath: undefined,
        fallback: 'dist/client',
        subdirectory: 'client',
      }),
    ).toBe('dist/client')
  })
})
