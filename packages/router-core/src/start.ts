import type { Serializer, SerovalTypeSerializer } from './serializer'

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
}

export interface StartRegister extends DefaultStartRegister {}

export type InferSerializer<TStart extends DefaultStartRegister> =
  unknown extends TStart['start']['_types']['serializer']
    ? SerovalTypeSerializer<unknown>
    : TStart['start']['_types']['serializer']['~types']['serializer']
