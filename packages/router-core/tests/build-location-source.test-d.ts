import { expectTypeOf, test } from 'vitest'
import type { BuildLocationFn, ParsedLocation } from '../src'

test('keeps the source optional and independently typed', () => {
  expectTypeOf<Parameters<BuildLocationFn>[1]>().toEqualTypeOf<
    ParsedLocation | undefined
  >()
  expectTypeOf<ReturnType<BuildLocationFn>>().toEqualTypeOf<ParsedLocation>()
})
