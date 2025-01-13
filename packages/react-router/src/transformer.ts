import { isPlainObject } from './utils'

export interface RouterTransformer {
  stringify: (obj: unknown) => string
  parse: (str: string) => unknown
  encode: <T>(value: T) => T
  decode: <T>(value: T) => T
}

export const defaultTransformer: RouterTransformer = {
  stringify: (value: any) =>
    JSON.stringify(value, function replacer(key, val) {
      const ogVal = this[key]
      const transformer = transformers.find((t) => t.stringifyCondition(ogVal))

      if (transformer) {
        return transformer.stringify(ogVal)
      }

      return val
    }),
  parse: (value: string) =>
    JSON.parse(value, function parser(key, val) {
      const ogVal = this[key]
      if (isPlainObject(ogVal)) {
        const transformer = transformers.find((t) => t.parseCondition(ogVal))

        if (transformer) {
          return transformer.parse(ogVal)
        }
      }

      return val
    }),
  encode: (value: any) => {
    // When encoding, dive first
    if (Array.isArray(value)) {
      return value.map((v) => defaultTransformer.encode(v))
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          defaultTransformer.encode(v),
        ]),
      )
    }

    const transformer = transformers.find((t) => t.stringifyCondition(value))
    if (transformer) {
      return transformer.stringify(value)
    }

    return value
  },
  decode: (value: any) => {
    // Attempt transform first
    if (isPlainObject(value)) {
      const transformer = transformers.find((t) => t.parseCondition(value))
      if (transformer) {
        return transformer.parse(value)
      }
    }

    if (Array.isArray(value)) {
      return value.map((v) => defaultTransformer.decode(v))
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          defaultTransformer.decode(v),
        ]),
      )
    }

    return value
  },
}

const createTransformer = <TKey extends string, TInput, TSerialized>(
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
// Make sure to keep DefaultSerializeable in sync with these transformers
// Also, make sure that they are unit tested in transformer.test.tsx
const transformers = [
  createTransformer(
    // Key
    'undefined',
    // Check
    (v): v is undefined => v === undefined,
    // To
    () => 0,
    // From
    () => undefined,
  ),
  createTransformer(
    // Key
    'date',
    // Check
    (v): v is Date => v instanceof Date,
    // To
    (v) => v.toISOString(),
    // From
    (v) => new Date(v),
  ),
  createTransformer(
    // Key
    'error',
    // Check
    (v): v is Error => v instanceof Error,
    // To
    (v) => ({ ...v, message: v.message, stack: v.stack, cause: v.cause }),
    // From
    (v) => Object.assign(new Error(v.message), v),
  ),
  createTransformer(
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
] as const

export type TransformerStringify<T, TSerializable> = T extends TSerializable
  ? T
  : T extends (...args: Array<any>) => any
    ? 'Function is not serializable'
    : { [K in keyof T]: TransformerStringify<T[K], TSerializable> }

export type TransformerParse<T, TSerializable> = T extends TSerializable
  ? T
  : T extends React.JSX.Element
    ? ReadableStream
    : { [K in keyof T]: TransformerParse<T[K], TSerializable> }

export type DefaultSerializable = Date | undefined | Error | FormData

export type DefaultTransformerStringify<T> = TransformerStringify<
  T,
  DefaultSerializable
>

export type DefaultTransformerParse<T> = TransformerParse<
  T,
  DefaultSerializable
>
