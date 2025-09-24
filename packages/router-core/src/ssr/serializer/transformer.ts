import { createPlugin } from 'seroval'
import { GLOBAL_TSR } from '../constants'
import type { Plugin, SerovalNode } from 'seroval'
import type { RegisteredConfigType, SSROption } from '../../router'
import type { LooseReturnType } from '../../utils'
import type { AnyRoute, ResolveAllSSR } from '../../route'

export type Serializable =
  | number
  | string
  | boolean
  | null
  | undefined
  | bigint
  | Date

export function createSerializationAdapter<
  TInput = unknown,
  TOutput = unknown /* we need to check that this type is actually serializable taking into account all seroval native types and any custom plugin WE=router/start add!!! */,
>(
  opts: CreateSerializationAdapterOptions<TInput, TOutput>,
): SerializationAdapter<TInput, TOutput> {
  return opts as unknown as SerializationAdapter<TInput, TOutput>
}

export interface CreateSerializationAdapterOptions<TInput, TOutput> {
  key: string
  test: (value: unknown) => value is TInput
  toSerializable: (value: TInput) => ValidateSerializable<TOutput, Serializable>
  fromSerializable: (value: TOutput) => TInput
}

export type ValidateSerializable<T, TSerializable> =
  T extends ReadonlyArray<unknown>
    ? ValidateSerializableArray<T, TSerializable>
    : T extends TSerializable
      ? T
      : T extends (...args: Array<any>) => any
        ? 'Function is not serializable'
        : T extends Promise<any>
          ? ValidateSerializablePromise<T, TSerializable>
          : T extends ReadableStream<any>
            ? ValidateReadableStream<T, TSerializable>
            : T extends Set<any>
              ? ValidateSerializableSet<T, TSerializable>
              : T extends Map<any, any>
                ? ValidateSerializableMap<T, TSerializable>
                : {
                    [K in keyof T]: ValidateSerializable<T[K], TSerializable>
                  }

export type ValidateSerializablePromise<T, TSerializable> =
  T extends Promise<infer TAwaited>
    ? Promise<ValidateSerializable<TAwaited, TSerializable>>
    : never

export type ValidateReadableStream<T, TSerializable> =
  T extends ReadableStream<infer TStreamed>
    ? ReadableStream<ValidateSerializable<TStreamed, TSerializable>>
    : never

export type ValidateSerializableSet<T, TSerializable> =
  T extends Set<infer TItem>
    ? Set<ValidateSerializable<TItem, TSerializable>>
    : never

export type ValidateSerializableMap<T, TSerializable> =
  T extends Map<infer TKey, infer TValue>
    ? Map<
        ValidateSerializable<TKey, TSerializable>,
        ValidateSerializable<TValue, TSerializable>
      >
    : never

type ValidateSerializableArray<
  T extends ReadonlyArray<unknown>,
  TSerializable,
> = number extends T['length']
  ? T extends Array<infer U>
    ? Array<ValidateSerializable<U, TSerializable>>
    : ReadonlyArray<ValidateSerializable<T[number], TSerializable>>
  : ValidateSerializableTuple<T, TSerializable>

type ValidateSerializableTuple<
  T extends ReadonlyArray<unknown>,
  TSerializable,
> = T extends readonly [infer THead, ...infer TTail]
  ? readonly [
      ValidateSerializable<THead, TSerializable>,
      ...ValidateSerializableTuple<
        TTail extends ReadonlyArray<unknown> ? TTail : [],
        TSerializable
      >,
    ]
  : T

export type RegisteredReadableStream =
  unknown extends SerializerExtensions['ReadableStream']
    ? never
    : SerializerExtensions['ReadableStream']

export interface DefaultSerializerExtensions {
  ReadableStream: unknown
}

export interface SerializerExtensions extends DefaultSerializerExtensions {}

export interface SerializationAdapter<TInput, TOutput> {
  '~types': SerializationAdapterTypes<TInput, TOutput>
  key: string
  test: (value: unknown) => value is TInput
  toSerializable: (value: TInput) => TOutput
  fromSerializable: (value: TOutput) => TInput
  makePlugin: (options: { didRun: boolean }) => Plugin<TInput, SerovalNode>
}

export interface SerializationAdapterTypes<TInput, TOutput> {
  input: TInput
  output: TOutput
}

export type AnySerializationAdapter = SerializationAdapter<any, any>

export function makeSsrSerovalPlugin<TInput, TOutput>(
  serializationAdapter: SerializationAdapter<TInput, TOutput>,
  options: { didRun: boolean },
) {
  return createPlugin<TInput, SerovalNode>({
    tag: '$TSR/t/' + serializationAdapter.key,
    test: serializationAdapter.test,
    parse: {
      stream(value, ctx) {
        return ctx.parse(serializationAdapter.toSerializable(value))
      },
    },
    serialize(node, ctx) {
      options.didRun = true
      return (
        GLOBAL_TSR +
        '.t.get("' +
        serializationAdapter.key +
        '")(' +
        ctx.serialize(node) +
        ')'
      )
    },
    // we never deserialize on the server during SSR
    deserialize: undefined as never,
  })
}

export function makeSerovalPlugin<TInput, TOutput>(
  serializationAdapter: SerializationAdapter<TInput, TOutput>,
) {
  return createPlugin<TInput, SerovalNode>({
    tag: '$TSR/t/' + serializationAdapter.key,
    test: serializationAdapter.test,
    parse: {
      sync(value, ctx) {
        return ctx.parse(serializationAdapter.toSerializable(value))
      },
      async async(value, ctx) {
        return await ctx.parse(serializationAdapter.toSerializable(value))
      },
      stream(value, ctx) {
        return ctx.parse(serializationAdapter.toSerializable(value))
      },
    },
    // we don't generate JS code outside of SSR (for now)
    serialize: undefined as never,
    deserialize(node, ctx) {
      return serializationAdapter.fromSerializable(
        ctx.deserialize(node) as TOutput,
      )
    },
  })
}

export type ValidateSerializableInput<TRegister, T> = ValidateSerializable<
  T,
  RegisteredSerializableInput<TRegister>
>

export type RegisteredSerializableInput<TRegister> =
  | (unknown extends RegisteredSerializationAdapters<TRegister>
      ? never
      : RegisteredSerializationAdapters<TRegister> extends ReadonlyArray<AnySerializationAdapter>
        ? RegisteredSerializationAdapters<TRegister>[number]['~types']['input']
        : never)
  | Serializable

export type RegisteredSerializationAdapters<TRegister> = RegisteredConfigType<
  TRegister,
  'serializationAdapters'
>

export type ValidateSerializableInputResult<TRegister, T> =
  ValidateSerializableResult<T, RegisteredSerializableInput<TRegister>>

export type ValidateSerializableResult<T, TSerializable> =
  T extends ReadonlyArray<unknown>
    ? ValidateSerializableResultArray<T, TSerializable>
    : T extends TSerializable
      ? T
      : unknown extends SerializerExtensions['ReadableStream']
        ? { [K in keyof T]: ValidateSerializableResult<T[K], TSerializable> }
        : T extends SerializerExtensions['ReadableStream']
          ? ReadableStream
          : { [K in keyof T]: ValidateSerializableResult<T[K], TSerializable> }

type ValidateSerializableResultArray<
  T extends ReadonlyArray<unknown>,
  TSerializable,
> = number extends T['length']
  ? T extends Array<infer U>
    ? Array<ValidateSerializableResult<U, TSerializable>>
    : ReadonlyArray<ValidateSerializableResult<T[number], TSerializable>>
  : ValidateSerializableResultTuple<T, TSerializable>

type ValidateSerializableResultTuple<
  T extends ReadonlyArray<unknown>,
  TSerializable,
> = T extends readonly [infer THead, ...infer TTail]
  ? readonly [
      ValidateSerializableResult<THead, TSerializable>,
      ...ValidateSerializableResultTuple<
        TTail extends ReadonlyArray<unknown> ? TTail : [],
        TSerializable
      >,
    ]
  : T

export type RegisteredSSROption<TRegister> =
  unknown extends RegisteredConfigType<TRegister, 'defaultSsr'>
    ? SSROption
    : RegisteredConfigType<TRegister, 'defaultSsr'>

export type ValidateSerializableLifecycleResult<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
> = false extends (TRegister extends { ssr: infer TSSR } ? TSSR : never)
  ? any
  : ValidateSerializableLifecycleResultSSR<
        TRegister,
        TParentRoute,
        TSSR,
        TFn
      > extends infer TInput
    ? TInput
    : never

export type ValidateSerializableLifecycleResultSSR<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
> =
  ResolveAllSSR<TParentRoute, TSSR> extends false
    ? any
    : RegisteredSSROption<TRegister> extends false
      ? any
      : ValidateSerializableInput<TRegister, LooseReturnType<TFn>>
