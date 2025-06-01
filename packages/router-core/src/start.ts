import type {
  Serializer,
  SerovalTypeSerializer,
  TypeSerializerStringify,
} from './serializer'
import type { LooseAsyncReturnType, LooseReturnType } from './utils'

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

export type SSREnabled<TStart> = TStart extends DefaultStartRegister
  ? TStart['ssr']
  : never

export type InferSerializer<TStart> = TStart extends DefaultStartRegister
  ? unknown extends TStart['start']['_types']['serializer']
    ? SerovalTypeSerializer<unknown>
    : TStart['start']['_types']['serializer']['~types']['serializer']
  : never

export type TypeSerializerStringifyReturnType<
  TStart,
  TFn,
  TLifecycleSerialization,
  TLifecycle extends keyof LifecycleSerialization,
> =
  false extends SSREnabled<TStart>
    ? any
    : false extends IsSerializationEnabled<TLifecycleSerialization, TLifecycle>
      ? any
      : TFn extends (...args: Array<any>) => Promise<any>
        ? Promise<
            TypeSerializerStringify<
              InferSerializer<TStart>,
              LooseAsyncReturnType<TFn>
            >
          >
        : TypeSerializerStringify<InferSerializer<TStart>, LooseReturnType<TFn>>

export interface LifecycleSerialization {
  context?: boolean
  beforeLoad?: boolean
  loader?: boolean
}

export interface DefaultLifecycleSerialization {
  context: false
  beforeLoad: true
  loader: true
}

export type IsSerializationEnabled<
  TLifecycleSerialization,
  TLifecycle extends keyof LifecycleSerialization,
> = TLifecycleSerialization extends LifecycleSerialization
  ? unknown extends TLifecycleSerialization[TLifecycle]
    ? DefaultLifecycleSerialization[TLifecycle]
    : TLifecycleSerialization[TLifecycle]
  : DefaultLifecycleSerialization[TLifecycle]
