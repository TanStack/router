import type {
  CreateStartConfig as CreateStartConfigCore,
  Serializer,
  StartConfig as StartConfigCore,
} from '@tanstack/router-core'

export interface CreateStartConfig<in out TSerializer extends Serializer>
  extends CreateStartConfigCore<TSerializer> {}

export interface StartConfig<in out TSerializer extends Serializer>
  extends StartConfigCore<TSerializer> {}

export const createStart = <TSerializer extends Serializer>(
  config: CreateStartConfig<TSerializer>,
): StartConfig<TSerializer> => {
  return undefined as unknown as StartConfig<TSerializer>
}
