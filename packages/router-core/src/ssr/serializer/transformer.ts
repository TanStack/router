import { createPlugin } from 'seroval'
import { GLOBAL_TSR } from '../constants'
import type { SerovalNode } from 'seroval'

export type Transformer<TInput, TTransformed> = {
  key: string
  test: (value: any) => value is TInput
  toSerializable: (value: TInput) => TTransformed
  fromSerializable: (value: TTransformed) => TInput
}

export type AnyTransformer = Transformer<any, any>

export function createSerializationAdapter<
  TKey extends string,
  TInput,
  TTransformed /* we need to check that this type is actually serializable taking into account all seroval native types and any custom plugin WE=router/start add!!! */,
>(opts: {
  key: TKey
  test: (value: any) => value is TInput
  toSerializable: (value: TInput) => TTransformed
  fromSerializable: (value: TTransformed) => TInput
}): Transformer<TInput, TTransformed> {
  return opts
}

export function makeSsrSerovalPlugin<TInput, TTransformed>(
  transformer: Transformer<TInput, TTransformed>,
  options: { didRun: boolean },
) {
  return createPlugin<TInput, SerovalNode>({
    tag: '$TSR/t/' + transformer.key,
    test: transformer.test,
    parse: {
      stream(value, ctx) {
        return ctx.parse(transformer.toSerializable(value))
      },
    },
    serialize(node, ctx) {
      options.didRun = true
      return (
        GLOBAL_TSR +
        '.t.get("' +
        transformer.key +
        '")(' +
        ctx.serialize(node) +
        ')'
      )
    },
    // we never deserialize on the server during SSR
    deserialize: undefined as never,
  })
}

export function makeSerovalPlugin<TInput, TTransformed>(
  transformer: Transformer<TInput, TTransformed>,
) {
  return createPlugin<TInput, SerovalNode>({
    tag: '$TSR/t/' + transformer.key,
    test: transformer.test,
    parse: {
      sync(value, ctx) {
        return ctx.parse(transformer.toSerializable(value))
      },
      async async(value, ctx) {
        return await ctx.parse(transformer.toSerializable(value))
      },
      stream(value, ctx) {
        return ctx.parse(transformer.toSerializable(value))
      },
    },
    // we don't generate JS code outside of SSR (for now)
    serialize: undefined as never,
    deserialize(node, ctx) {
      return transformer.fromSerializable(ctx.deserialize(node) as TTransformed)
    },
  })
}
