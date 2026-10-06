import { describe, expect, test } from 'vitest'
import { analyzeModule, collectModuleReferences } from '../src'

const comparisonChain = `const a = 1, b = 2, c = 3
export const r = a < b > (c)
export const element = <p>{r}</p>`

function referencedNames(filename: string) {
  const module = analyzeModule({ code: comparisonChain, filename })
  return [...collectModuleReferences(module, module.ast)]
    .map((binding) => binding.name)
    .sort()
}

describe('source language follows the file extension', () => {
  // JavaScript has no type arguments: `a < b > (c)` is two comparisons, while
  // TypeScript reads it as a call of `a` with the type argument `b`.
  test.each([
    'route.js',
    'route.jsx',
    'route.mjs',
    'route.cjs',
    '/src/routes/index.js?tsr-split=component',
  ])('parses %s as JavaScript with JSX', (filename) => {
    expect(referencedNames(filename)).toEqual(['a', 'b', 'c', 'r'])
  })

  test('parses .tsx files as TypeScript with JSX', () => {
    expect(referencedNames('route.tsx')).toEqual(['a', 'c', 'r'])
  })
})
