import { expectTypeOf, test } from 'vitest'
import { analyzeModule, createBindingCleanup } from '../src'
import type { RemoveUnusedBindingsOptions } from '../src'
import type { Node, Program } from '@yuku-toolchain/types'

test('reusable cleanup accepts output trees and per-output roots', () => {
  const module = analyzeModule({ code: 'const value = 1' })
  const cleanup = createBindingCleanup(module)
  expectTypeOf(cleanup).parameters.toEqualTypeOf<
    [Program, WeakMap<Node, Node>, RemoveUnusedBindingsOptions?]
  >()
  expectTypeOf(cleanup).returns.toEqualTypeOf<void>()
})
