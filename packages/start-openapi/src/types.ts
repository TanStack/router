import type { StandardSchemaV1 } from './standard-schema'

/**
 * The declarative, spec-bearing metadata that TanStack Start server routes and
 * request middleware can carry. Everything in this file is *static* — it can be
 * read at build time after a module is evaluated, without ever executing a
 * route handler or a middleware `.server()` function.
 *
 * See `DESIGN.md` for the rationale (the "declarative metadata" constraint from
 * the discussion: anything validated imperatively inside `.server()` is
 * invisible to a generator, so the spec-bearing parts stay declarative).
 */

/** OpenAPI parameter locations that map to HTTP request "slots". */
export type RequestSlot = 'body' | 'query' | 'path' | 'headers'

/**
 * Slot-shaped validator, as declared via `validator` on request middleware or a
 * method builder. HTTP requests have locations (body, query string, path
 * params, headers) that the server-function validator model does not, so it is
 * keyed by slot rather than being a single schema.
 */
export interface RequestValidatorSlots {
  body?: StandardSchemaV1
  query?: StandardSchemaV1
  path?: StandardSchemaV1
  headers?: StandardSchemaV1
}

/**
 * Every schema that applies to each slot across the middleware chain, parents
 * first. The request must satisfy all of them (intersection), so emitters
 * combine them with `allOf`.
 */
export type RequestSlotSchemas = {
  [TSlot in RequestSlot]?: Array<StandardSchemaV1>
}

/**
 * An OpenAPI Security Scheme (subset). Declared once on an auth middleware so
 * every route in its chain inherits `security` in the emitted spec.
 *
 * Mirrors the OpenAPI 3.1 Security Scheme Object.
 */
export type SecurityScheme =
  | {
      type: 'http'
      scheme: 'bearer' | 'basic' | (string & {})
      bearerFormat?: string
      description?: string
    }
  | {
      type: 'apiKey'
      name: string
      in: 'header' | 'query' | 'cookie'
      description?: string
    }
  | {
      type: 'oauth2'
      flows: Record<string, unknown>
      description?: string
    }
  | {
      type: 'openIdConnect'
      openIdConnectUrl: string
      description?: string
    }

/** A named security scheme: the name becomes the `components.securitySchemes` key. */
export interface NamedSecurityScheme {
  name: string
  scheme: SecurityScheme
}

/**
 * Response declaration for a single method, as a per-status map.
 *
 * Resolves discussion question #4 in favour of an explicit per-status map: it is
 * the only shape that survives round-tripping to OpenAPI without a lossy
 * "success + error convention" guess.
 */
export type ResponseMap = Partial<
  Record<number | 'default', StandardSchemaV1 | ResponseObject>
>

export interface ResponseObject {
  description?: string
  /** Schema for the `application/json` body. */
  schema?: StandardSchemaV1
  /** Override the media type (defaults to `application/json`). */
  mediaType?: string
}

/** HTTP methods that carry an OpenAPI operation (HEAD/OPTIONS are excluded by default). */
export type OpenApiMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'options'
  | 'head'

/**
 * A single, fully-normalized operation — the unit the emitter consumes. The
 * collector (`collectFromRouteTree`) produces these from the live route tree;
 * the emitter (`buildOpenApiDocument`) turns them into an OpenAPI document.
 *
 * Keeping this as the seam means the emitter is testable without a router, and
 * any future collector (AST-based, runtime-based, manual) can target it.
 */
export interface OperationInput {
  method: OpenApiMethod
  /** OpenAPI-style path with `{param}` placeholders. */
  path: string
  /**
   * Stable operation name, doubling as the MCP tool name. The collector always
   * sets it, falling back to {@link defaultOperationId}.
   */
  operationId?: string
  summary?: string
  description?: string
  tags?: Array<string>
  deprecated?: boolean
  request?: RequestSlotSchemas
  responses?: ResponseMap
  /**
   * Names of security schemes that apply to this operation. Each must be
   * registered in `securitySchemes`. An empty array means "no auth".
   */
  security?: Array<string>
}

/**
 * The normalized manifest the emitter consumes: a flat list of operations plus
 * the registry of security schemes they reference.
 */
export interface OpenApiManifest {
  operations: Array<OperationInput>
  securitySchemes: Array<NamedSecurityScheme>
}

export interface OpenApiInfo {
  title: string
  version: string
  description?: string
}

/** A converter from a Standard Schema to a JSON Schema (OpenAPI 3.1 / 2020-12). */
export type ToJSONSchema = (
  schema: StandardSchemaV1,
  io: 'input' | 'output',
) => JSONSchema | Promise<JSONSchema>

export interface GenerateOptions {
  info: OpenApiInfo
  servers?: Array<{ url: string; description?: string }>
  /**
   * Schema → JSON Schema converter. Defaults to a Zod-v4-aware converter (see
   * `defaultToJSONSchema`). Override to support Valibot/ArkType/etc. or to tweak
   * conversion options.
   */
  toJSONSchema?: ToJSONSchema
}

// Loose JSON Schema / OpenAPI document types — intentionally permissive. We are
// emitting, not consuming, so a structural `Record` keeps the surface small.
export type JSONSchema = Record<string, any>
export type OpenApiDocument = Record<string, any>
