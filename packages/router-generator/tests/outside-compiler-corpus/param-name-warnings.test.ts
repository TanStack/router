/**
 * Not part of the compiler test corpus (out of scope: SPEC J1.12 neither
 * requires nor forbids warnings about unusual but valid param names;
 * FIX-PLAN GEN-12). Characterisation of today's warnings for param names
 * that are no JavaScript identifiers. The routes such files get are tested
 * in the compiler test corpus (the invalid-param-names fixture,
 * generator.test.ts).
 */
import { describe, expect, test } from 'vitest'
import { captureConsole } from '@tanstack/compiler-test-utils/diagnostics'
import { createApp, fileRoute, generate, rootRoute } from '../app'

/** An app with a root route and a route file for each of `files`. */
function appWithRoutes(files: Array<string>) {
  return createApp({
    'src/routes/__root.tsx': rootRoute(),
    ...Object.fromEntries(
      files.map((file) => [`src/routes/${file}`, fileRoute('/wrong')]),
    ),
  })
}

describe('param name warnings', () => {
  test('only param names that are no identifiers get a warning, naming them', async () => {
    const root = await appWithRoutes([
      '$123.tsx',
      '$user-name.tsx',
      '$validParam.tsx',
      '{-$locale}/about.tsx',
      'posts/{$postId}.tsx',
      'files/prefix{$}.tsx',
      'opt/{-$}.tsx',
      'users/user-{$user-id}.tsx',
      // No params: a route without `$`, and a `$` inside a static segment
      'about.tsx',
      'prices/usd-$.tsx',
    ])
    const { diagnostics } = await captureConsole(() =>
      generate(root, { disableLogging: false }),
    )

    const warnings = diagnostics.filter(
      (diagnostic) => diagnostic.severity === 'warning',
    )
    const naming = (name: string) =>
      warnings.filter(({ text }) => text.includes(`"${name}"`))
    for (const name of ['123', 'user-name', 'user-id']) {
      expect(naming(name), name).toHaveLength(1)
    }
    for (const name of ['validParam', 'locale', 'postId']) {
      expect(naming(name), name).toEqual([])
    }
  })
})
