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

  it('should preserve recursive tuples without infinite expansion', () => {
    type ResultTuple = readonly [
      ReadonlyArray<ResultTuple>,
      { [key: string]: ResultTuple }
    ]
    expectTypeOf<
      ValidateSerializableResult<ResultTuple, Serializable>
    >().branded.toEqualTypeOf<ResultTuple>()
  })

  it('should preserve readonly recursive arrays without infinite expansion', () => {
    type ResultReadonlyArray = ReadonlyArray<
      ResultReadonlyArray | { [key: string]: ResultReadonlyArray }
    >
    expectTypeOf<
      ValidateSerializableResult<ResultReadonlyArray, Serializable>
    >().branded.toEqualTypeOf<ResultReadonlyArray>()
  })
})
