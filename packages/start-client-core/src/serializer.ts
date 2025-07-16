import { isPlainObject } from '@tanstack/router-core'

export interface StartSerializer {
  stringify: (obj: unknown) => string
  parse: (str: string) => unknown
  encode: <T>(value: T) => T
  decode: <T>(value: T) => T
}

export type SerializerStringifyBy<T, TSerializable> = T extends TSerializable
  ? T
  : T extends (...args: Array<any>) => any
    ? 'Function is not serializable'
    : { [K in keyof T]: SerializerStringifyBy<T[K], TSerializable> }

export type SerializerParseBy<T, TSerializable> = T extends TSerializable
  ? T
  : unknown extends SerializerExtensions['ReadableStream']
    ? { [K in keyof T]: SerializerParseBy<T[K], TSerializable> }
    : T extends SerializerExtensions['ReadableStream']
      ? ReadableStream
      : { [K in keyof T]: SerializerParseBy<T[K], TSerializable> }

export interface DefaultSerializerExtensions {
  ReadableStream: unknown
}

export interface SerializerExtensions extends DefaultSerializerExtensions {}

export type Serializable = Date | undefined | Error | FormData | bigint

export type SerializerStringify<T> = SerializerStringifyBy<T, Serializable>

export type SerializerParse<T> = SerializerParseBy<T, Serializable>
export const startSerializer: StartSerializer = {
  stringify: (value: any) =>
    JSON.stringify(value, function replacer(key, val) {
      const ogVal = this[key]
      const serializer = serializers.find((t) => t.stringifyCondition(ogVal))

      if (serializer) {
        return serializer.stringify(ogVal)
      }

      return val
    }),
  parse: (value: string) =>
    JSON.parse(value, function parser(key, val) {
      const ogVal = this[key]
      if (isPlainObject(ogVal)) {
        const serializer = serializers.find((t) => t.parseCondition(ogVal))

        if (serializer) {
          return serializer.parse(ogVal)
        }
      }

      return val
    }),
  encode: (value: any) => {
    // When encoding, dive first
    if (Array.isArray(value)) {
      return value.map((v) => startSerializer.encode(v))
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          startSerializer.encode(v),
        ]),
      )
    }

    const serializer = serializers.find((t) => t.stringifyCondition(value))
    if (serializer) {
      return serializer.stringify(value)
    }

    return value
  },
  decode: (value: any) => {
    // Attempt transform first
    if (isPlainObject(value)) {
      const serializer = serializers.find((t) => t.parseCondition(value))
      if (serializer) {
        return serializer.parse(value)
      }
    }

    if (Array.isArray(value)) {
      return value.map((v) => startSerializer.decode(v))
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          startSerializer.decode(v),
        ]),
      )
    }

    return value
  },
}
const createSerializer = <TKey extends string, TInput, TSerialized>(
  key: TKey,
  check: (value: any) => value is TInput,
  toValue: (value: TInput) => TSerialized,
  fromValue: (value: TSerialized) => TInput,
) => ({
  key,
  stringifyCondition: check,
  stringify: (value: any) => ({ [`$${key}`]: toValue(value) }),
  parseCondition: (value: any) => Object.hasOwn(value, `$${key}`),
  parse: (value: any) => fromValue(value[`$${key}`]),
})
// Keep these ordered by predicted frequency
// Make sure to keep DefaultSerializable in sync with these serializers
// Also, make sure that they are unit tested in serializer.test.tsx
const serializers = [
  createSerializer(
    // Key
    'undefined',
    // Check
    (v): v is undefined => v === undefined,
    // To
    () => 0,
    // From
    () => undefined,
  ),
  createSerializer(
    // Key
    'date',
    // Check
    (v): v is Date => v instanceof Date,
    // To
    (v) => v.toISOString(),
    // From
    (v) => new Date(v),
  ),
  createSerializer(
    // Key
    'error',
    // Check
    (v): v is Error => v instanceof Error,
    // To
    (v) => ({
      ...v,
      message: v.message,
      stack: process.env.NODE_ENV === 'development' ? v.stack : undefined,
      cause: v.cause,
    }),
    // From
    (v) => Object.assign(new Error(v.message), v),
  ),
  createSerializer(
    // Key
    'formData',
    // Check
    (v): v is FormData => v instanceof FormData,
    // To
    (v) => {
      const entries: Record<
        string,
        Array<FormDataEntryValue> | FormDataEntryValue
      > = {}
      v.forEach((value, key) => {
        const entry = entries[key]
        if (entry !== undefined) {
          if (Array.isArray(entry)) {
            entry.push(value)
          } else {
            entries[key] = [entry, value]
          }
        } else {
          entries[key] = value
        }
      })
      return entries
    },
    // From
    (v) => {
      const formData = new FormData()
      Object.entries(v).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach((val) => formData.append(key, val))
        } else {
          formData.append(key, value)
        }
      })
      return formData
    },
  ),
  createSerializer(
    // Key
    'bigint',
    // Check
    (v): v is bigint => typeof v === 'bigint',
    // To
    (v) => v.toString(),
    // From
    (v) => BigInt(v),
  ),
] as const
