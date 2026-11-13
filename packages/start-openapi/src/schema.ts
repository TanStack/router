import { isStandardSchema } from './standard-schema'
import type { JSONSchema, ToJSONSchema } from './types'

/**
 * Default Standard Schema → JSON Schema converter.
 *
 * OpenAPI 3.1 is a superset of JSON Schema 2020-12, which is exactly what Zod
 * v4's `z.toJSONSchema()` emits — so for the common (Zod) case the output drops
 * straight into the document with no post-processing.
 *
 * Zod is an *optional* peer: we only `import('zod')` when we actually encounter a
 * Zod schema. Other vendors should pass `options.toJSONSchema`.
 *
 * `io` distinguishes request schemas (validator *input* — what the client sends,
 * e.g. before defaults/coercion) from response schemas (validator *output*).
 */
export const defaultToJSONSchema: ToJSONSchema = async (schema, io) => {
  if (!isStandardSchema(schema)) {
    throw new Error(
      '[start-openapi] Expected a Standard Schema (e.g. a Zod/Valibot/ArkType schema).',
    )
  }

  const vendor = schema['~standard'].vendor

  if (vendor === 'zod') {
    const z = await import('zod')
    // `z.toJSONSchema` is a static helper on the Zod v4 namespace.
    const toJSONSchema = (z as any).toJSONSchema as
      | ((s: unknown, opts?: Record<string, unknown>) => JSONSchema)
      | undefined
    if (typeof toJSONSchema !== 'function') {
      throw new Error(
        '[start-openapi] `z.toJSONSchema` not found. Zod v4+ is required for the built-in converter.',
      )
    }
    return toJSONSchema(schema, {
      io,
      // Keep unrepresentable constructs (e.g. transforms) from throwing the
      // whole build; they degrade to permissive schemas instead.
      unrepresentable: 'any',
    })
  }

  throw new Error(
    `[start-openapi] No built-in JSON Schema converter for vendor "${vendor}". ` +
      'Pass `options.toJSONSchema` to support this validator library.',
  )
}
