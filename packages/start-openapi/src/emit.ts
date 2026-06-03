import { convertSlot, defaultToJSONSchema } from './schema'
import type { StandardSchemaV1 } from './standard-schema'
import type {
  GenerateOptions,
  JSONSchema,
  OpenApiDocument,
  OpenApiManifest,
  OperationInput,
  ResponseObject,
  ToJSONSchema,
} from './types'

/**
 * Turn a normalized manifest into an OpenAPI 3.1 document.
 *
 * This is the pure, router-agnostic half of the system: no knowledge of route
 * trees or middleware, just `OperationInput[]` → document. That seam is what
 * makes the emitter unit-testable without booting a Start app.
 */
export async function buildOpenApiDocument(
  manifest: OpenApiManifest,
  options: GenerateOptions,
): Promise<OpenApiDocument> {
  const toJSONSchema: ToJSONSchema = options.toJSONSchema ?? defaultToJSONSchema

  const components: {
    schemas: Record<string, JSONSchema>
    securitySchemes: Record<string, unknown>
  } = { schemas: {}, securitySchemes: {} }

  for (const { name, scheme } of manifest.securitySchemes) {
    components.securitySchemes[name] = scheme
  }

  const paths: Record<string, Record<string, unknown>> = {}

  for (const op of manifest.operations) {
    const pathItem = (paths[op.path] ??= {})
    pathItem[op.method] = await buildOperation(op, components, toJSONSchema)
  }

  const doc: OpenApiDocument = {
    openapi: '3.1.0',
    info: options.info,
    ...(options.servers ? { servers: options.servers } : {}),
    paths,
  }

  const hasComponents =
    Object.keys(components.schemas).length > 0 ||
    Object.keys(components.securitySchemes).length > 0
  if (hasComponents) {
    doc.components = {}
    if (Object.keys(components.schemas).length > 0)
      doc.components.schemas = components.schemas
    if (Object.keys(components.securitySchemes).length > 0)
      doc.components.securitySchemes = components.securitySchemes
  }

  return doc
}

async function buildOperation(
  op: OperationInput,
  components: { schemas: Record<string, JSONSchema> },
  toJSONSchema: ToJSONSchema,
): Promise<Record<string, unknown>> {
  const operation: Record<string, unknown> = {}

  if (op.operationId) operation.operationId = op.operationId
  if (op.summary) operation.summary = op.summary
  if (op.description) operation.description = op.description
  if (op.tags?.length) operation.tags = op.tags
  if (op.deprecated) operation.deprecated = true

  const parameters: Array<Record<string, unknown>> = []

  // Path params come from the path template itself (OpenAPI requires every
  // `{param}` to be declared and `required: true`). A `path` slot schema, if
  // present, supplies the per-param schema; otherwise we default to `string`.
  const pathSlotParams = new Map(
    (
      await slotToParameters(op.request?.path, 'path', components, toJSONSchema)
    ).map((p) => [p.name as string, p]),
  )
  for (const name of pathParamNames(op.path)) {
    const fromSlot = pathSlotParams.get(name)
    parameters.push(
      fromSlot
        ? { ...fromSlot, required: true }
        : { name, in: 'path', required: true, schema: { type: 'string' } },
    )
  }

  // Query params: required iff the JSON Schema marks them required.
  parameters.push(
    ...(await slotToParameters(op.request?.query, 'query', components, toJSONSchema)),
  )

  // Header params.
  parameters.push(
    ...(await slotToParameters(
      op.request?.headers,
      'header',
      components,
      toJSONSchema,
    )),
  )

  if (parameters.length) operation.parameters = parameters

  // Request body.
  const bodySchema = await convertSlot(op.request?.body, 'input', toJSONSchema)
  if (bodySchema) {
    operation.requestBody = {
      required: true,
      content: {
        'application/json': { schema: hoist(bodySchema, components) },
      },
    }
  }

  // Responses. OpenAPI requires at least one response.
  operation.responses = await buildResponses(op, components, toJSONSchema)

  // Security.
  if (op.security) {
    operation.security = op.security.map((name) => ({ [name]: [] }))
  }

  return operation
}

/**
 * Expand a slot schema (an object schema) into one OpenAPI parameter per
 * top-level property. This is how a single `query`/`path`/`headers` Zod object
 * becomes individual `parameters[]` entries.
 */
async function slotToParameters(
  schema: StandardSchemaV1 | undefined,
  location: 'query' | 'path' | 'header',
  components: { schemas: Record<string, JSONSchema> },
  toJSONSchema: ToJSONSchema,
): Promise<Array<Record<string, unknown>>> {
  if (!schema) return []
  const json = await toJSONSchema(schema, 'input')
  const resolved = hoist(json, components)
  // Parameters need the concrete object schema, not a $ref, to read properties.
  const objectSchema = resolved.$ref
    ? components.schemas[refName(resolved.$ref)]
    : resolved

  const props: Record<string, JSONSchema> = objectSchema?.properties ?? {}
  const required: Array<string> = objectSchema?.required ?? []

  return Object.entries(props).map(([name, propSchema]) => ({
    name,
    in: location,
    required: location === 'path' ? true : required.includes(name),
    schema: propSchema,
  }))
}

async function buildResponses(
  op: OperationInput,
  components: { schemas: Record<string, JSONSchema> },
  toJSONSchema: ToJSONSchema,
): Promise<Record<string, unknown>> {
  const responses: Record<string, unknown> = {}

  const entries = Object.entries(op.responses ?? {})
  if (entries.length === 0) {
    // Every operation needs a response; default to a bare 200.
    responses['200'] = { description: 'Successful response' }
    return responses
  }

  for (const [status, value] of entries) {
    if (value === undefined) continue
    const { description, schema, mediaType } = normalizeResponse(value, status)
    const response: Record<string, unknown> = { description }
    if (schema) {
      const json = hoist(await toJSONSchema(schema, 'output'), components)
      response.content = { [mediaType]: { schema: json } }
    }
    responses[status] = response
  }

  return responses
}

function normalizeResponse(
  value: StandardSchemaV1 | ResponseObject,
  status: string,
): { description: string; schema?: StandardSchemaV1; mediaType: string } {
  if ('~standard' in value) {
    return {
      description: defaultStatusText(status),
      schema: value,
      mediaType: 'application/json',
    }
  }
  const obj = value
  return {
    description: obj.description ?? defaultStatusText(status),
    schema: obj.schema,
    mediaType: obj.mediaType ?? 'application/json',
  }
}

function defaultStatusText(status: string): string {
  if (status === 'default') return 'Default response'
  const code = Number(status)
  if (code >= 200 && code < 300) return 'Successful response'
  if (code >= 400 && code < 500) return 'Client error'
  if (code >= 500) return 'Server error'
  return 'Response'
}

/**
 * Hoist a converted JSON Schema's `$defs` and top-level `$id` into
 * `components.schemas`, rewriting `#/$defs/X` references to
 * `#/components/schemas/X`. A schema with a top-level `$id` is replaced by a
 * `$ref` to its component (the discussion's "`$id` → component" rule).
 */
function hoist(
  schema: JSONSchema,
  components: { schemas: Record<string, JSONSchema> },
): JSONSchema {
  const defs: Record<string, JSONSchema> | undefined =
    schema.$defs ?? schema.definitions
  if (defs) {
    for (const [name, def] of Object.entries(defs)) {
      if (!(name in components.schemas)) {
        components.schemas[name] = rewriteRefs(stripDefs(def))
      }
    }
  }

  const cleaned = rewriteRefs(stripDefs(schema))

  const id: string | undefined = cleaned.$id
  if (id) {
    const name = componentNameFromId(id)
    delete cleaned.$id
    if (!(name in components.schemas)) components.schemas[name] = cleaned
    return { $ref: `#/components/schemas/${name}` }
  }

  return cleaned
}

function stripDefs(schema: JSONSchema): JSONSchema {
  const out = { ...schema }
  delete out.$defs
  delete out.definitions
  delete out.$schema
  return out
}

/** Recursively rewrite `#/$defs/X` and `#/definitions/X` refs to components. */
function rewriteRefs(value: any): any {
  if (Array.isArray(value)) return value.map(rewriteRefs)
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === '$ref' && typeof v === 'string') {
        out[k] = v
          .replace('#/$defs/', '#/components/schemas/')
          .replace('#/definitions/', '#/components/schemas/')
      } else {
        out[k] = rewriteRefs(v)
      }
    }
    return out
  }
  return value
}

function componentNameFromId(id: string): string {
  // `$id` may be a bare name or a URI; take the last path segment.
  const last = id.split('/').pop() ?? id
  return last.replace(/[^A-Za-z0-9_.-]/g, '_')
}

function refName(ref: string): string {
  return ref.split('/').pop() ?? ref
}

function pathParamNames(path: string): Array<string> {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]!)
}
