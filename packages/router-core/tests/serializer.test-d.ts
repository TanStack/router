import { describe, expectTypeOf, it } from 'vitest'

import type {
  Serializable,
  SerializationError,
  TsrSerializable,
  ValidateSerializable,
} from '../src/ssr/serializer/transformer'

describe('Serializer', () => {
  it('fails for non-serializable types', () => {
    const value = () => {}
    expectTypeOf<
      ValidateSerializable<typeof value, Serializable>
    >().toEqualTypeOf<SerializationError<'Function may not be serializable'>>()
  })

  it('works for types extending TsrSerializable', () => {
    type MyCustomType = { f: () => {} } & TsrSerializable
    expectTypeOf<
      ValidateSerializable<MyCustomType, Serializable>
    >().toEqualTypeOf<MyCustomType>()
  })

  it('works for readonly sets containing serializable values', () => {
    type Value = ReadonlySet<string>

    expectTypeOf<
      ValidateSerializable<Value, Serializable>
    >().toEqualTypeOf<Value>()
  })

  it('fails for readonly sets containing unserializable values', () => {
    type Value = ReadonlySet<() => void>

    expectTypeOf<ValidateSerializable<Value, Serializable>>().toEqualTypeOf<
      ReadonlySet<SerializationError<'Function may not be serializable'>>
    >()
  })

  it('works for readonly maps containing serializable values', () => {
    type Value = ReadonlyMap<string, number>

    expectTypeOf<
      ValidateSerializable<Value, Serializable>
    >().toEqualTypeOf<Value>()
  })

  it('fails for readonly maps containing unserializable values', () => {
    type Value = ReadonlyMap<string, () => void>

    expectTypeOf<ValidateSerializable<Value, Serializable>>().toEqualTypeOf<
      ReadonlyMap<
        string,
        SerializationError<'Function may not be serializable'>
      >
    >()
  })
})
