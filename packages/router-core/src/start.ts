import type {
  Serializer,
  SerovalTypeSerializer,
  TypeSerializerStringify,
} from './serializer'
import type { LooseAsyncReturnType } from './utils'

export interface StartConfigTypes<in out TSerializer extends Serializer> {
  serializer: TSerializer
}

export interface StartConfig<in out TSerializer extends Serializer> {
  _types: StartConfigTypes<TSerializer>
}

export type AnyStartConfig = StartConfig<any>

export interface CreateStartConfig<in out TSerializer extends Serializer> {
  serializer: TSerializer
}

export interface DefaultStartRegister {
  start: AnyStartConfig
  ssr: boolean
}

export interface StartRegister extends DefaultStartRegister {}

export type InferSerializer<TStart extends DefaultStartRegister> =
  unknown extends TStart['start']['_types']['serializer']
    ? SerovalTypeSerializer<unknown>
    : TStart['start']['_types']['serializer']['~types']['serializer']

export type TypeSerializerStringifyReturnType<
  TStart extends DefaultStartRegister,
  TFn,
  TStringify = TypeSerializerStringify<
    InferSerializer<TStart>,
    LooseAsyncReturnType<TFn>
  >,
> = boolean extends TStart['ssr'] ? any : TStringify | Promise<TStringify>
