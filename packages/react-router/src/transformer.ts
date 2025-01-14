import type { DefaultSerializable } from '@tanstack/router-core'

export type TransformerParse<T, TSerializable> = T extends TSerializable
  ? T
  : T extends React.JSX.Element
    ? ReadableStream
    : { [K in keyof T]: TransformerParse<T[K], TSerializable> }

export type DefaultTransformerParse<T> = TransformerParse<
  T,
  DefaultSerializable
>
