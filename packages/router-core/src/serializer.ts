import type { Plugin } from 'seroval'
import type { Constrain } from './utils'

export interface StartSerializer {
  stringify: (obj: unknown) => string
  parse: (str: string) => unknown
  encode: <T>(value: T) => T
  decode: <T>(value: T) => T
}

// help me fill in the runtime
export interface Serializer {
  '~types': {
    serializer: unknown
  }
  stringify: (obj: unknown) => string
  parse: (str: string) => unknown
}

export type TypeSerializerStringifyBy<T, TSerializable> =
  T extends TSerializable
    ? T
    : T extends (...args: Array<any>) => any
      ? 'Function is not serializable'
      : { [K in keyof T]: TypeSerializerStringifyBy<T[K], TSerializable> }

export type TypeSerializerParseBy<T, TSerializable> = T extends TSerializable
  ? T
  : unknown extends SerializerExtensions['ReadableStream']
    ? { [K in keyof T]: TypeSerializerParseBy<T[K], TSerializable> }
    : T extends SerializerExtensions['ReadableStream']
      ? ReadableStream
      : { [K in keyof T]: TypeSerializerParseBy<T[K], TSerializable> }

export interface DefaultSerializerExtensions {
  ReadableStream: unknown
}

export interface SerializerExtensions extends DefaultSerializerExtensions {}

export type DefaultTypeSerializable =
  | Date
  | undefined
  | Error
  | FormData
  | bigint

export type DefaultTypeSerializerStringify<T> = TypeSerializerStringifyBy<
  T,
  DefaultTypeSerializable
>

export type DefaultTypeSerializerParse<T> = TypeSerializerParseBy<
  T,
  DefaultTypeSerializable
>

export interface TypeSerializer {
  value: unknown
  parse: unknown
  stringify: unknown
}

export interface TypeSerializerValue<T> {
  value: T
}

export type TypeSerializerApply<
  TSerializer extends TypeSerializer,
  T,
> = TSerializer & TypeSerializerValue<T>

export interface DefaultTypeSerializer extends TypeSerializer {
  parse: DefaultTypeSerializerParse<this['value']>
  stringify: DefaultTypeSerializerStringify<this['value']>
}

export type TypeSerializerParse<
  TSerializer extends TypeSerializer,
  T,
> = TypeSerializerApply<TSerializer, T>['parse']

export type TypeSerializerStringify<
  TSerializer extends TypeSerializer,
  T,
> = TypeSerializerApply<TSerializer, T>['stringify']

export interface SerovalSerializerOptions<TPlugins> {
  plugins?: Constrain<TPlugins, ReadonlyArray<Plugin<any, any>>>
}

export const serovalSerializer = <const TPlugins>(
  options?: SerovalSerializerOptions<TPlugins>,
): SerovalSerializer<TPlugins> => {
  // please help with the runtime
  return undefined as any
}

export interface SerovalSerializer<TPlugins> extends Serializer {
  '~types': {
    serializer: SerovalTypeSerializer<TPlugins>
  }
}

export interface SerovalTypeSerializer<TPlugins> extends TypeSerializer {
  stringify: SerovalTypeStringify<TPlugins, this['value']>
  parse: DefaultTypeSerializerParse<this['value']>
}

export type SerovalTypeStringify<TPlugins, T> = unknown extends T
  ? T
  : T extends SerovalTypeSerializable<TPlugins>
    ? T
    : T extends (...args: Array<any>) => any
      ? 'Function is not serializable'
      : T extends Set<any>
        ? SerovalTypeSetStringify<TPlugins, T>
        : T extends Map<any, any>
          ? SerovalTypeMapStringify<TPlugins, T>
          : { [K in keyof T]: SerovalTypeStringify<TPlugins, T[K]> }

export type SerovalTypeSerializable<TPlugins> =
  | RegExp
  | Date
  | undefined
  | string
  | number
  | bigint
  | Error
  | null
  | SerovalPluginsTypeSerializable<TPlugins>

export type SerovalTypeSetStringify<TPlugins, T> =
  T extends Set<infer TItem>
    ? Set<SerovalTypeStringify<TPlugins, TItem>>
    : never

export type SerovalTypeMapStringify<TPlugins, T> =
  T extends Map<infer TKey, infer TValue>
    ? Map<
        SerovalTypeStringify<TPlugins, TKey>,
        SerovalTypeStringify<TPlugins, TValue>
      >
    : never

export type SerovalPluginsTypeSerializable<TPlugins> = unknown extends TPlugins
  ? never
  : TPlugins extends ReadonlyArray<Plugin<any, any>>
    ? TPlugins[number] extends infer TPlugin
      ? TPlugin extends Plugin<infer TValue, any>
        ? TValue
        : never
      : never
    : never
