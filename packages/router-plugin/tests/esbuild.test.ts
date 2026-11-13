import { describe, expect, test } from 'vitest'
import {
  TanStackRouterCodeSplitterEsbuild,
  TanStackRouterGeneratorEsbuild,
  tanstackRouter,
} from '../src/esbuild'

describe('esbuild plugin', () => {
  test('refuses autoCodeSplitting', () => {
    expect(() =>
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    ).toThrow(
      '@tanstack/router-plugin: route code splitting (`autoCodeSplitting`) is not supported with esbuild. ' +
        'Use the generator alone (`TanStackRouterGeneratorEsbuild`), or set `autoCodeSplitting: false`.',
    )
  })

  test('refuses the code splitter entry', () => {
    expect(() => TanStackRouterCodeSplitterEsbuild()).toThrow(
      /autoCodeSplitting/,
    )
  })

  test('accepts route generation without code splitting', () => {
    expect(() => tanstackRouter({ target: 'react' })).not.toThrow()
    expect(() =>
      tanstackRouter({ target: 'react', autoCodeSplitting: false }),
    ).not.toThrow()
    expect(() => TanStackRouterGeneratorEsbuild()).not.toThrow()
  })
})
