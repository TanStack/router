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
    // When encodign, dive first
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

const createTransformer = <T extends string>(
  key: T,
  check: (value: any) => boolean,
  toValue: (value: any) => any = (v) => v,
  fromValue: (value: any) => any = (v) => v,
) => ({
  key,
  stringifyCondition: check,
  stringify: (value: any) => ({ [`$${key}`]: toValue(value) }),
  parseCondition: (value: any) => Object.hasOwn(value, `$${key}`),
  parse: (value: any) => fromValue(value[`$${key}`]),
})

// Keep these ordered by predicted frequency
const transformers = [
  createTransformer(
    // Key
    'undefined',
    // Check
    (v) => v === undefined,
    // To
    () => 0,
    // From
    () => undefined,
  ),
  createTransformer(
    // Key
    'date',
    // Check
    (v) => v instanceof Date,
    // To
    (v) => v.toISOString(),
    // From
    (v) => new Date(v),
  ),
  createTransformer(
    // Key
    'error',
    // Check
    (v) => v instanceof Error,
    // To
    (v) => ({ ...v, message: v.message, stack: v.stack, cause: v.cause }),
    // From
    (v) => Object.assign(new Error(v.message), v),
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

export type DefaultTransformerStringify<T> = TransformerStringify<
  T,
  Date | undefined
>

export type DefaultTransformerParse<T> = TransformerParse<T, Date | undefined>
