import { expectTypeOf, test } from 'vitest'
import { b } from 'yuku-ast'
import {
  analyzeModule,
  cloneGeneratedNode,
  cloneModuleAst,
  generateModule,
  linkGeneratedReference,
  prependStatements,
  sourcePosition,
} from '../src/ast'
import type { Identifier, Program } from '@yuku-toolchain/types'
import type { Module } from 'yuku-analyzer'

test('Yuku AST and semantic handles preserve their types', () => {
  const module = analyzeModule({ code: 'const value = 1' })
  expectTypeOf(module).toEqualTypeOf<Module>()
  const clone = cloneModuleAst(module)
  expectTypeOf(clone.program).toEqualTypeOf<Program>()
  const reference = linkGeneratedReference(
    b.Identifier({ name: 'value' }),
    'value',
  )
  expectTypeOf(reference).toEqualTypeOf<Identifier>()
  expectTypeOf(cloneGeneratedNode(reference)).toEqualTypeOf<Identifier>()
  expectTypeOf(generateModule(clone.program).code).toEqualTypeOf<string>()
  expectTypeOf(prependStatements(clone.program)).toEqualTypeOf<void>()
  expectTypeOf(sourcePosition('', 0)).toEqualTypeOf<{
    line: number
    column: number
  }>()
})
