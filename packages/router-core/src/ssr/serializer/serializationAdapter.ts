import type {
  AnySerializationAdapter,
  CreateSerializationAdapterOptions,
  SerializationAdapter,
} from './transformer'

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
