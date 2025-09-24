import { describe, expectTypeOf, it } from 'vitest'

import type {
  Serializable,
  ValidateSerializableResult,
} from '../src/ssr/serializer/transformer'

describe('ValidateSerializableResult recursion', () => {
  it('should preserve recursive payload without infinite expansion', () => {
    type Result = Array<Result> | { [key: string]: Result }
    expectTypeOf<
      ValidateSerializableResult<Result, Serializable>
    >().branded.toEqualTypeOf<Result>()
  })
})
