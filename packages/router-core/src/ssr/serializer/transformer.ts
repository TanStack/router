import type { PluginInfo, SerovalNode } from 'seroval'
import type { RegisteredConfigType, RegisteredSsr } from '../../router'
import type { NotFoundError } from '../../not-found'
import type {
  AnyRoute,
  LifecycleFunction,
  LifecycleReturnType,
  ResolveAllSSR,
} from '../../route'
import type { RawStream } from './RawStream'

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
  Uint8Array: Uint8Array
  RawStream: RawStream
  TsrSerializable: TsrSerializable
  void: void
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
  if (process.env.NODE_ENV !== 'production') {
    // Seroval escapes most of these characters before plugin lookup. NUL and
    // lone surrogates are transport-unstable. Reject every surrogate code unit
    // to keep adapter keys and this development-only check simple.
    if (
      !opts.key ||
      /[\0"\\<\b\t\f\r\n\u2028\u2029\uD800-\uDFFF]/.test(opts.key)
    ) {
      throw new Error(
        `createSerializationAdapter: key ${JSON.stringify(opts.key)} is ` +
          'invalid. Serialization adapter keys must be non-empty and not ' +
          'contain NUL, ", \\, <, backspace, tab, form feed, line ' +
          'terminators, or UTF-16 surrogate code units.',
      )
    }
  }
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
  /**
   * A non-empty Seroval plugin identifier.
   *
   * Must not contain NUL, `"`, `\\`, `<`, backspace, tab, form feed, line
   * terminators, or UTF-16 surrogate code units. Key validation runs only in
   * development.
   */
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

export type ValidateSerializable<T, TSerializable> = T extends TSerializable
  ? T
  : T extends (...args: Array<any>) => any
    ? SerializationError<'Function may not be serializable'>
    : T extends RegisteredReadableStream
      ? SerializationError<'JSX is not be serializable'>
      : T extends ReadonlyArray<any>
        ? ValidateSerializableArray<T, TSerializable>
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
                  : T extends object
                    ? ValidateSerializableMapped<T, TSerializable>
                    : SerializationError<'Type may not be serializable'>

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

export type ValidateSerializableArray<T, TSerializable> = T extends readonly [
  any,
  ...Array<any>,
]
  ? ValidateSerializableMapped<T, TSerializable>
  : T extends Array<infer U>
    ? Array<ValidateSerializable<U, TSerializable>>
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<ValidateSerializable<U, TSerializable>>
      : never

export type ValidateSerializableMapped<T, TSerializable> = {
  [K in keyof T]: ValidateSerializable<T[K], TSerializable>
}

const SERIALIZATION_ERROR = Symbol.for('TSR_SERIALIZATION_ERROR')

export interface SerializationError<in out TMessage extends string> {
  [SERIALIZATION_ERROR]: TMessage
}

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

export interface AdapterNode extends PluginInfo {
  v: SerovalNode
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

// The gate sits in the check type of an `infer` conditional: inference walks the
// branches of a conditional return type, never its check type, so a lifecycle function
// whose return is inferred against this does not instantiate the gate's branches.
export type ValidateSerializableLifecycleResult<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
  TExtraControlFlow = NotFoundError,
> =
  ValidateSerializableLifecycleResultGate<
    TRegister,
    TParentRoute,
    TSSR,
    TFn,
    TExtraControlFlow
  > extends infer TInput
    ? TInput
    : never

type ValidateSerializableLifecycleResultGate<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
  TExtraControlFlow,
> =
  false extends RegisteredSsr<TRegister>
    ? any
    : ValidateSerializableLifecycleResultSSR<
        TRegister,
        TParentRoute,
        TSSR,
        TFn,
        TExtraControlFlow
      >

export type ValidateSerializableLifecycleResultSSR<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TFn,
  TExtraControlFlow = NotFoundError,
> =
  ResolveAllSSR<TParentRoute, TSSR, TRegister> extends false
    ? any
    : LifecycleFunction<TFn> extends {
          '~types': { server: unknown; client: unknown }
        }
      ? ValidateSerializableLifecycleReturn<
          TRegister,
          LifecycleReturnType<TFn, 'server'>,
          TExtraControlFlow
        > extends infer TValid
        ? [LifecycleReturnType<TFn, 'server'>] extends [TValid]
          ? LifecycleReturnType<TFn, 'shared'>
          : TValid
        : never
      : ValidateSerializableLifecycleReturn<
          TRegister,
          LifecycleReturnType<TFn, 'shared'>,
          TExtraControlFlow
        >

type ValidateSerializableLifecycleReturn<
  TRegister,
  TReturn,
  TExtraControlFlow,
> = [TReturn] extends [Promise<infer TAwaited>]
  ? Promise<
      ValidateSerializableLifecycleData<TRegister, TAwaited, TExtraControlFlow>
    >
  : ValidateSerializableLifecycleData<TRegister, TReturn, TExtraControlFlow>

// Redirects are control flow. Existing beforeLoad/loader returns also exempt
// NotFoundError; context passes never because it treats returned not-found objects
// as data. Next to control flow, a valid result is the target as written: a
// union of the validated data and the all-optional NotFoundError would accept any
// object in the function form's intersection check. For the same reason the
// result is not distributed over its members.
type ValidateSerializableLifecycleData<TRegister, T, TExtraControlFlow> = [
  LifecycleControlFlow<T, TExtraControlFlow>,
] extends [never]
  ? ValidateSerializableInput<TRegister, T>
  : ValidateSerializableInput<
        TRegister,
        LifecycleData<T, TExtraControlFlow>
      > extends infer TValid
    ? [LifecycleData<T, TExtraControlFlow>] extends [TValid]
      ? T
      : TValid
    : never

// A redirect is a Response with `options`, as `isRedirect` checks; its router
// type does not matter. An object that is only assignable to NotFoundError
// (`{ data: () => 1 }`) is data.
type LifecycleControlFlow<T, TExtraControlFlow> = T extends Response & {
  options: object
}
  ? T
  : T extends TExtraControlFlow
    ? TExtraControlFlow extends T
      ? T
      : never
    : never

type LifecycleData<T, TExtraControlFlow> =
  T extends LifecycleControlFlow<T, TExtraControlFlow> ? never : T

/**
 * Same gate as ValidateSerializableLifecycleResult, but for the WIRE value returned
 * by a `dehydrate` function. Used as an intersection target (`TWire & ...`), so every
 * exit is `unknown` (an `any` exit would collapse the intersection).
 */
// The first exit lets a real `unknown` or `any` wire through; route.ts never passes
// one, because LifecycleDehydrateReturn returns `unknown` for the uninferred wire
// (LifecycleNoWire, also `any` and `never`) and hands an `unknown` wire over as
// `symbol`. Keep the first exit anyway: it defers the whole gate while TWire is
// still generic, and deleting it measured as more type instantiations.
export type ValidateSerializableLifecycleWire<
  TRegister,
  TParentRoute extends AnyRoute,
  TSSR,
  TWire,
> = unknown extends TWire
  ? unknown
  : false extends RegisteredSsr<TRegister>
    ? unknown
    : ResolveAllSSR<TParentRoute, TSSR, TRegister> extends false
      ? unknown
      : ValidateSerializableInput<TRegister, TWire>

export type RegisteredReadableStream =
  unknown extends SerializerExtensions['ReadableStream']
    ? never
    : SerializerExtensions['ReadableStream']

export interface DefaultSerializerExtensions {
  ReadableStream: unknown
}

export interface SerializerExtensions extends DefaultSerializerExtensions {}
