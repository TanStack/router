import { isPlainObject } from './utils'

export interface RouterTransformer {
  stringify: (obj: unknown) => string
  parse: (str: string) => unknown
}

function buildTransformer(
  transformers: Array<Transformer<any>>,
): RouterTransformer & {
  withTransformers: (
    newTransformers: Array<Transformer<any>>,
  ) => ReturnType<typeof buildTransformer>
} {
  return {
    stringify: (value: any) =>
      JSON.stringify(value, function replacer(key, value) {
        const keyVal = this[key]
        const transformer = transformers.find((t) =>
          t.stringifyCondition(keyVal),
        )

        if (transformer) {
          return transformer.stringify(keyVal)
        }

        return value
      }),
    parse: (value: string) =>
      JSON.parse(value, function parser(key, value) {
        const keyVal = this[key]
        const transformer = transformers.find((t) => t.parseCondition(keyVal))

        if (transformer) {
          return transformer.parse(keyVal)
        }

        return value
      }),
    withTransformers: (newTransformers: Array<Transformer<any>>) =>
      buildTransformer([...newTransformers, ...transformers]),
  }
}

export interface Transformer<T> {
  stringifyCondition: (value: any) => boolean
  stringify: (value: T) => object | string
  parseCondition: (value: any) => boolean
  parse: (value: any) => T
}

const transformers = [
  {
    // Dates
    stringifyCondition: (value: any) => value instanceof Date,
    stringify: (value: any) => ({ $date: value.toISOString() }),
    parseCondition: (value: any) => isPlainObject(value) && value.$date,
    parse: (value: any) => new Date(value.$date),
  },
  {
    // undefined
    stringifyCondition: (value: any) => value === undefined,
    stringify: () => ({ $undefined: '' }),
    parseCondition: (value: any) =>
      isPlainObject(value) && value.$undefined === '',
    parse: () => undefined,
  },
] satisfies Array<Transformer<any>>

export const defaultTransformer = buildTransformer(transformers)
