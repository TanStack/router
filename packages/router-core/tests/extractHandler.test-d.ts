import { expectTypeOf, test } from 'vitest'
import type { ExtractHandler } from '../src'

test('ExtractHandler extracts handler from object form', () => {
  type Fn = (x: string) => number
  type ObjForm = { handler: Fn; dehydrate?: boolean }

  expectTypeOf<ExtractHandler<Fn>>().toEqualTypeOf<Fn>()
  expectTypeOf<ExtractHandler<ObjForm>>().toEqualTypeOf<Fn>()
})

test('ExtractHandler returns T for non-object types', () => {
  expectTypeOf<ExtractHandler<string>>().toEqualTypeOf<string>()
  expectTypeOf<ExtractHandler<undefined>>().toEqualTypeOf<undefined>()
  expectTypeOf<ExtractHandler<() => void>>().toEqualTypeOf<() => void>()
})
