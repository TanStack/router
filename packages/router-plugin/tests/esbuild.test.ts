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
    ).toThrow(/autoCodeSplitting/)
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
