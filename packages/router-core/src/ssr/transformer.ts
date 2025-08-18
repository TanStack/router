import { createPlugin } from 'seroval'
import { GLOBAL_TSR } from './constants'
import type { SerovalNode } from 'seroval'

export type Transformer<TInput, TTransformed> = {
  key: string
  toSerializable: (value: TInput) => TTransformed
  fromSerializable: (value: TTransformed) => TInput
  makePlugin: (options: {
    didRun: boolean
  }) => ReturnType<typeof createPlugin<TInput, SerovalNode>>
}

export type AnyTransformer = Transformer<any, any>

export function createSerializationAdapter<
  TKey extends string,
  TInput,
  TTransformed /* we need to check that this type is actually serializable taking into account all seroval native types and any custom plugin WE=router/start add!!! */,
>({
  key,
  test,
  toSerializable,
  fromSerializable,
}: {
  key: TKey
  test: (value: any) => value is TInput
  toSerializable: (value: TInput) => TTransformed
  fromSerializable: (value: TTransformed) => TInput
}): Transformer<TInput, TTransformed> {
  const makePlugin = (options: { didRun: boolean }) =>
    createPlugin<TInput, SerovalNode>({
      tag: `tanstack-router:transformer/${key}`,
      test,
      parse: {
        sync(value, ctx) {
          return ctx.parse(toSerializable(value))
        },
        async async(value, ctx) {
          return await ctx.parse(toSerializable(value))
        },
        stream(value, ctx) {
          return ctx.parse(toSerializable(value))
        },
      },
      serialize(node, ctx) {
        options.didRun = true
        return GLOBAL_TSR + '.t.get("' + key + '")(' + ctx.serialize(node) + ')'
      },
      deserialize(node, ctx) {
        return fromSerializable(ctx.deserialize(node) as TTransformed)
      },
    })
  return {
    makePlugin,
    key,
    toSerializable,
    fromSerializable,
  }
}
