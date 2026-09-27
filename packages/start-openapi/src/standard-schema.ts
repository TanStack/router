/**
 * Minimal vendored subset of the Standard Schema spec (https://standardschema.dev).
 *
 * Start's validator surface is already Standard-Schema-based (`router-core`'s
 * `StandardSchemaValidator`), so the OpenAPI layer speaks the same language and
 * stays validator-library-agnostic (Zod / Valibot / ArkType …). We only need the
 * `vendor` tag (to pick a converter) and the type carriers — not the full spec.
 */
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly '~standard': StandardSchemaV1Props<TInput, TOutput>
}

export interface StandardSchemaV1Props<TInput, TOutput> {
  readonly version: 1
  readonly vendor: string
  readonly validate: (
    value: unknown,
  ) =>
    | StandardSchemaV1Result<TOutput>
    | Promise<StandardSchemaV1Result<TOutput>>
  readonly types?:
    | { readonly input: TInput; readonly output: TOutput }
    | undefined
}

export type StandardSchemaV1Result<TOutput> =
  | { readonly value: TOutput; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<{ readonly message: string }> }

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  return (
    typeof value === 'object' &&
    value !== null &&
    '~standard' in value &&
    typeof (value as any)['~standard'] === 'object'
  )
}
