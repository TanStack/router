import { describe, expectTypeOf, it } from 'vitest'

import {
  Serializable,
  TsrSerializable,
  ValidateSerializable,
  ValidateSerializableResult,
} from '../src/ssr/serializer/transformer'

describe('Serializer', () => {
  describe('Default types are serializable: $name', () => {
    it('string', () => {
      const value: string = 'hello'
      expectTypeOf<
        ValidateSerializableResult<typeof value, Serializable>
      >().toBeString()
    })
    it('number', () => {
      const value: number = 123

      expectTypeOf<
        ValidateSerializableResult<typeof value, Serializable>
      >().toBeNumber()
    })
    it('boolean', () => {
      const value: boolean = true

      expectTypeOf<
        ValidateSerializableResult<typeof value, Serializable>
      >().toBeBoolean()
    })
    it('null', () => {
      const value = null

      expectTypeOf<
        ValidateSerializableResult<typeof value, Serializable>
      >().toBeNull()
    })
    it('undefined', () => {
      const value = undefined

      expectTypeOf<
        ValidateSerializableResult<typeof value, Serializable>
      >().toBeUndefined()
    })
    it('bigint', () => {
      const value = BigInt(123)

      expectTypeOf<
        ValidateSerializableResult<typeof value, Serializable>
      >().toBeBigInt()
    })
    it('Date', () => {
      const value = new Date()

      expectTypeOf<
        ValidateSerializableResult<typeof value, Serializable>
      >().toEqualTypeOf<Date>()
    })
  })
  it('fails for non-serializable types', () => {
    const value = () => {}
    expectTypeOf<
      ValidateSerializable<typeof value, Serializable>
    >().toEqualTypeOf<'Function is not serializable'>()
  })

  it('works for types extending TsrSerializable', () => {
    type MyCustomType = { f: () => {} } & TsrSerializable
    expectTypeOf<
      ValidateSerializable<MyCustomType, Serializable>
    >().toEqualTypeOf<MyCustomType>()
  })
})
