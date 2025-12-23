import { describe, expectTypeOf, it } from 'vitest'

import type {
  Serializable,
  ValidateSerializable,
  ValidateSerializableResult,
} from '../src/ssr/serializer/transformer'

describe('ValidateSerializable array handling', () => {
  it('preserves nested array payloads for input validation', () => {
    type Input = Array<{ value: string; nested: Array<{ id: number }> }>
    expectTypeOf<
      ValidateSerializable<Input, Serializable>
    >().branded.toEqualTypeOf<Input>()
  })

  it('preserves tuple structure for input validation', () => {
    type InputTuple = readonly [{ name: string }, { count: number }]
    expectTypeOf<
      ValidateSerializable<InputTuple, Serializable>
    >().branded.toEqualTypeOf<InputTuple>()
  })

  it('preserves readonly array structure for input validation', () => {
    type InputReadonlyArray = ReadonlyArray<{ value: string }>
    expectTypeOf<
      ValidateSerializable<InputReadonlyArray, Serializable>
    >().branded.toEqualTypeOf<InputReadonlyArray>()
  })

  it('preserves recursive payloads wrapped in Promise for input validation', () => {
    type Recursive = { value: number; next?: Recursive }
    type InputPromise = Promise<Recursive>
    expectTypeOf<
      ValidateSerializable<InputPromise, Serializable>
    >().branded.toEqualTypeOf<InputPromise>()
  })

  it('preserves recursive payloads wrapped in Promise<Array> for input validation', () => {
    type Recursive = { value: number; children?: Array<Recursive> }
    type InputPromiseArray = Promise<Array<Recursive>>
    expectTypeOf<
      ValidateSerializable<InputPromiseArray, Serializable>
    >().branded.toEqualTypeOf<InputPromiseArray>()
  })

  it('preserves recursive payloads wrapped in ReadableStream for input validation', () => {
    type Recursive = { value: number; next?: Recursive }
    type InputStream = ReadableStream<Recursive>
    expectTypeOf<
      ValidateSerializable<InputStream, Serializable>
    >().branded.toEqualTypeOf<InputStream>()
  })

  it('should preserve recursive payload without infinite expansion', () => {
    type Result = Array<Result> | { [key: string]: Result }
    expectTypeOf<
      ValidateSerializableResult<Result, Serializable>
    >().branded.toEqualTypeOf<Result>()
  })

  it('should preserve recursive tuples without infinite expansion', () => {
    type ResultTuple = readonly [
      ReadonlyArray<ResultTuple>,
      { [key: string]: ResultTuple },
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
