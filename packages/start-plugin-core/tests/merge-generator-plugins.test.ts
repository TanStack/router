import { describe, expect, test } from 'vitest'
import { mergeStartGeneratorPlugins } from '../src/start-router-plugin/merge-generator-plugins'
import type { GeneratorPlugin } from '@tanstack/router-generator'

function plugin(name: string): GeneratorPlugin {
  return { name }
}

describe('mergeStartGeneratorPlugins', () => {
  test('returns internal plugins when user plugins are absent', () => {
    const internal = [plugin('a'), plugin('b')]

    expect(mergeStartGeneratorPlugins(internal)).toEqual(internal)
    expect(mergeStartGeneratorPlugins(internal, undefined)).toEqual(internal)
    expect(mergeStartGeneratorPlugins(internal, null)).toEqual(internal)
    expect(mergeStartGeneratorPlugins(internal, [])).toEqual(internal)
  })

  test('appends user plugins after Start internals (does not clobber)', () => {
    const internal = [plugin('client-tree'), plugin('routes-manifest')]
    const user = [plugin('probe'), plugin('custom')]

    expect(mergeStartGeneratorPlugins(internal, user)).toEqual([
      plugin('client-tree'),
      plugin('routes-manifest'),
      plugin('probe'),
      plugin('custom'),
    ])
  })

  test('does not mutate the internal array', () => {
    const internal = [plugin('a')]
    const user = [plugin('b')]
    const merged = mergeStartGeneratorPlugins(internal, user)

    expect(internal).toEqual([plugin('a')])
    expect(merged).not.toBe(internal)
  })
})
