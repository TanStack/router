import { createPlugin } from 'seroval'
import { GLOBAL_TSR } from '../constants'
import type { Plugin, SerovalNode } from 'seroval'
import type {
  RegisteredConfigType,
  RegisteredSsr,
  SSROption,
} from '../../router'
import type { LooseReturnType } from '../../utils'
import type { AnyRoute, ResolveAllSSR } from '../../route'

declare const TSR_SERIALIZABLE: unique symbol
export type TSR_SERIALIZABLE = typeof TSR_SERIALIZABLE

export type TsrSerializable = { [TSR_SERIALIZABLE]: true }
export interface DefaultSerializable {
  number: number
  string: string
  boolean: boolean
  null: null
  undefined: undefined
  bigint: bigint
  Date: Date
  TsrSerializable: TsrSerializable
}

export interface SerializableExtensions extends DefaultSerializable {}

export type Serializable = SerializableExtensions[keyof SerializableExtensions]

export type UnionizeSerializationAdaptersInput<
  TAdapters extends ReadonlyArray<AnySerializationAdapter>,
> = TAdapters[number]['~types']['input']

/**
 * Create a strongly-typed serialization adapter for SSR hydration.
 * Use to register custom types with the router serializer.
 */
export function createSerializationAdapter<
  TInput = unknown,
  TOutput = unknown,
  const TExtendsAdapters extends
    | ReadonlyArray<AnySerializationAdapter>
    | never = never,
>(
  opts: CreateSerializationAdapterOptions<TInput, TOutput, TExtendsAdapters>,
): SerializationAdapter<TInput, TOutput, TExtendsAdapters> {
  return opts as unknown as SerializationAdapter<
    TInput,
    TOutput,
    TExtendsAdapters
  >
}

export interface CreateSerializationAdapterOptions<
  TInput,
  TOutput,
  TExtendsAdapters extends ReadonlyArray<AnySerializationAdapter> | never,
> {
  key: string
  extends?: TExtendsAdapters
  test: (value: unknown) => value is TInput
  toSerializable: (
    value: TInput,
  ) => ValidateSerializable<
    TOutput,
    Serializable | UnionizeSerializationAdaptersInput<TExtendsAdapters>
  >
  fromSerializable: (value: TOutput) => TInput
}

export type ValidateSerializable<T, TSerializable> =
  T extends ReadonlyArray<unknown>
    ? ResolveArrayShape<T, TSerializable, 'input'>
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
                : T extends AsyncGenerator<any, any>
                  ? ValidateSerializableAsyncGenerator<T, TSerializable>
                  : {
                      [K in keyof T]: ValidateSerializable<T[K], TSerializable>
                    }

export type ValidateSerializableAsyncGenerator<T, TSerializable> =
  T extends AsyncGenerator<infer T, infer TReturn, infer TNext>
    ? AsyncGenerator<
        ValidateSerializable<T, TSerializable>,
        ValidateSerializable<TReturn, TSerializable>,
        TNext
      >
    : never

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

export type RegisteredReadableStream =
  unknown extends SerializerExtensions['ReadableStream']
    ? never
    : SerializerExtensions['ReadableStream']

export interface DefaultSerializerExtensions {
  ReadableStream: unknown
}

export interface SerializerExtensions extends DefaultSerializerExtensions {}

export interface SerializationAdapter<
  TInput,
  TOutput,
  TExtendsAdapters extends ReadonlyArray<AnySerializationAdapter>,
> {
  '~types': SerializationAdapterTypes<TInput, TOutput, TExtendsAdapters>
  key: string
  extends?: TExtendsAdapters
  test: (value: unknown) => value is TInput
  toSerializable: (value: TInput) => TOutput
  fromSerializable: (value: TOutput) => TInput
}

export interface SerializationAdapterTypes<
  TInput,
  TOutput,
  TExtendsAdapters extends ReadonlyArray<AnySerializationAdapter>,
> {
  input: TInput | UnionizeSerializationAdaptersInput<TExtendsAdapters>
  output: TOutput
  extends: TExtendsAdapters
}

export type AnySerializationAdapter = SerializationAdapter<any, any, any>

/** Create a Seroval plugin for server-side serialization only. */
export function makeSsrSerovalPlugin(
  serializationAdapter: AnySerializationAdapter,
  options: { didRun: boolean },
): Plugin<any, SerovalNode> {
  return createPlugin<any, SerovalNode>({
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

/** Create a Seroval plugin for client/server symmetric (de)serialization. */
export function makeSerovalPlugin(
  serializationAdapter: AnySerializationAdapter,
): Plugin<any, SerovalNode> {
  return createPlugin<any, SerovalNode>({
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
      return serializationAdapter.fromSerializable(ctx.deserialize(node))
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
    ? ResolveArrayShape<T, TSerializable, 'result'>
    : T extends TSerializable
      ? T
      : unknown extends SerializerExtensions['ReadableStream']
        ? { [K in keyof T]: ValidateSerializableResult<T[K], TSerializable> }
        : T extends SerializerExtensions['ReadableStream']
          ? ReadableStream
          : { [K in keyof T]: ValidateSerializableResult<T[K], TSerializable> }

export type RegisteredSSROption<TRegister> =
  unknown extends RegisteredConfigType<TRegister, 'defaultSsr'>
    ? SSROption
    : RegisteredConfigType<TRegister, 'defaultSsr'>

export type ValidateSerializableLifecycleResult<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
> =
  false extends RegisteredSsr<TRegister>
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

type ResolveArrayShape<
  T extends ReadonlyArray<unknown>,
  TSerializable,
  TMode extends 'input' | 'result',
> = number extends T['length']
  ? T extends Array<infer U>
    ? Array<ArrayModeResult<TMode, U, TSerializable>>
    : ReadonlyArray<ArrayModeResult<TMode, T[number], TSerializable>>
  : ResolveTupleShape<T, TSerializable, TMode>

type ResolveTupleShape<
  T extends ReadonlyArray<unknown>,
  TSerializable,
  TMode extends 'input' | 'result',
> = T extends readonly [infer THead, ...infer TTail]
  ? readonly [
      ArrayModeResult<TMode, THead, TSerializable>,
      ...ResolveTupleShape<Readonly<TTail>, TSerializable, TMode>,
    ]
  : T

type ArrayModeResult<
  TMode extends 'input' | 'result',
  TValue,
  TSerializable,
> = TMode extends 'input'
  ? ValidateSerializable<TValue, TSerializable>
  : ValidateSerializableResult<TValue, TSerializable>
