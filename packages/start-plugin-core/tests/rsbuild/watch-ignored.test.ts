import { describe, expect, test } from 'vitest'
import { addWorkspaceWatchIgnored } from '../../src/rsbuild/watch-ignored'

describe('workspace watch exclusions', () => {
  test('preserves an existing predicate and excludes only the workspace dist directory', () => {
    const ignored = addWorkspaceWatchIgnored(
      (entry) => entry.endsWith('.generated.ts'),
      ['/repo/packages/router/dist'],
    )
    expect(typeof ignored).toBe('function')
    if (typeof ignored !== 'function') {
      throw new Error('Expected a watch predicate')
    }
    expect(ignored('/app/route.generated.ts')).toBe(true)
    expect(ignored('/repo/packages/router/dist/index.js')).toBe(true)
    expect(ignored('/repo/packages/router/dist')).toBe(true)
    expect(ignored('/repo/packages/router/dist-other/index.js')).toBe(false)
    expect(ignored('/app/route.ts')).toBe(false)
  })

  test('retains default, regex, and glob exclusions', () => {
    expect(addWorkspaceWatchIgnored(undefined, ['/repo/dist'])).toEqual(
      /[\\/](?:\.git|node_modules)[\\/]|^\/repo\/dist(?:[\\/]|$)/,
    )
    expect(addWorkspaceWatchIgnored(/generated/, ['/repo/dist'])).toEqual(
      /generated|^\/repo\/dist(?:[\\/]|$)/,
    )
    expect(addWorkspaceWatchIgnored('**/generated/**', ['/repo/dist'])).toEqual(
      ['**/generated/**', '/repo/dist'],
    )
    expect(
      addWorkspaceWatchIgnored(['**/generated/**'], ['/repo/dist']),
    ).toEqual(['**/generated/**', '/repo/dist'])
  })
})
