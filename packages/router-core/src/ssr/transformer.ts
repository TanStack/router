import { createPlugin } from 'seroval'
import { GLOBAL_TSR } from './constants'
import type { SerovalNode } from 'seroval'

export type Transformer<TInput, TTransformed> = {
  key: string
  toValue: (value: TInput) => TTransformed
  fromValue: (value: TTransformed) => TInput
  makePlugin: (options: {
    didRun: boolean
  }) => ReturnType<typeof createPlugin<TInput, SerovalNode>>
}

export type AnyTransformer = Transformer<any, any>

export function createTransformer<
  TKey extends string,
  TInput,
  TTransformed /* we need to check that this type is actually serializable taking into account all seroval native types and any custom plugin WE=router/start add!!! */,
>({
  key,
  test,
  toValue,
  fromValue,
}: {
  key: TKey
  test: (value: any) => value is TInput
  // TODO we need a better naming for `toValue` and `fromValue`
  // `toValue` is a function that transforms the input value to a serializable value.
  // it is NOT `stringify`, as the result is not necessarily a string. It can be an object, Map, etc. whatever seroval is able to serialize.
  toValue: (value: TInput) => TTransformed
  fromValue: (value: TTransformed) => TInput
}): Transformer<TInput, TTransformed> {
  const makePlugin = (options: { didRun: boolean }) =>
    createPlugin<TInput, SerovalNode>({
      tag: `tanstack-router:transformer/${key}`,
      test,
      parse: {
        sync(value, ctx) {
          return ctx.parse(toValue(value))
        },
        async async(value, ctx) {
          return await ctx.parse(toValue(value))
        },
        stream(value, ctx) {
          return ctx.parse(toValue(value))
        },
      },
      serialize(node, ctx) {
        options.didRun = true
        return GLOBAL_TSR + '.t.get("' + key + '")(' + ctx.serialize(node) + ')'
      },
      deserialize(node, ctx) {
        return fromValue(ctx.deserialize(node) as TTransformed)
      },
    })
  return {
    makePlugin,
    key,
    toValue,
    fromValue,
  }
}
