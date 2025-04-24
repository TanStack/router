export interface StartSerializer {
  stringify: (obj: unknown) => string
  parse: (str: string) => unknown
  encode: <T>(value: T) => T
  decode: <T>(value: T) => T
}

export type SerializerStringifyBy<T, TSerializable> = T extends TSerializable
  ? T
  : T extends (...args: Array<any>) => any
    ? 'Function is not serializable'
    : { [K in keyof T]: SerializerStringifyBy<T[K], TSerializable> }

export type SerializerParseBy<T, TSerializable> = T extends TSerializable
  ? T
  : unknown extends SerializerExtensions['ReadableStream']
    ? { [K in keyof T]: SerializerParseBy<T[K], TSerializable> }
    : T extends SerializerExtensions['ReadableStream']
      ? ReadableStream
      : { [K in keyof T]: SerializerParseBy<T[K], TSerializable> }

export interface DefaultSerializerExtensions {
  ReadableStream: unknown
}

export interface SerializerExtensions extends DefaultSerializerExtensions {}

export type Serializable = Date | undefined | Error | FormData | bigint

export type SerializerStringify<T> = SerializerStringifyBy<T, Serializable>

export type SerializerParse<T> = SerializerParseBy<T, Serializable>
