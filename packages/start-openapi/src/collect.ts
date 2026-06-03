import type {
  InputValidatorSlots,
  NamedSecurityScheme,
  OpenApiManifest,
  OpenApiMethod,
  OperationInput,
  ResponseMap,
  SecurityScheme,
} from './types'

/**
 * Structural views of the *live* TanStack Start runtime shapes the collector
 * reads. These mirror the real runtime objects (`route.options.server`,
 * `middleware.options`, a method builder's resolved options) without importing
 * router internals — so the collector compiles standalone and stays robust to
 * unrelated type churn. The fields marked "proposed" are the additive surface
 * this design introduces; see `DESIGN.md`.
 */
export interface RuntimeRouteNode {
  /** Full path as TanStack stores it, e.g. `/api/v1/sequences/$id`. */
  fullPath?: string
  path?: string
  id?: string
  children?:
    | Array<RuntimeRouteNode>
    | Record<string, RuntimeRouteNode>
    | undefined
  options?: {
    server?: RuntimeServerOptions
  }
}

export interface RuntimeServerOptions {
  /** Route-level request middleware chain. */
  middleware?: Array<RuntimeMiddleware>
  /** Either a resolved record or a `({ createHandlers }) => createHandlers({...})` fn. */
  handlers?:
    | Record<string, RuntimeMethodHandler>
    | ((opts: { createHandlers: (d: any) => any }) => Record<
        string,
        RuntimeMethodHandler
      >)
}

/** A method entry: either a bare handler fn (no metadata) or a builder options object. */
export type RuntimeMethodHandler =
  | ((...args: Array<any>) => unknown)
  | RuntimeMethodBuilderOptions

export interface RuntimeMethodBuilderOptions {
  handler?: (...args: Array<any>) => unknown
  middleware?: Array<RuntimeMiddleware>
  /** Proposed: per-status response schemas. */
  response?: ResponseMap
  /** Proposed: slot-shaped inline input validator. */
  inputValidator?: InputValidatorSlots
  /** Optional OpenAPI metadata hints. */
  meta?: OperationMeta
}

export interface RuntimeMiddleware {
  options?: {
    middleware?: Array<RuntimeMiddleware>
    /** Proposed: slot-shaped input validator on request middleware. */
    inputValidator?: InputValidatorSlots
    /** Proposed: declarative security scheme. */
    securityScheme?: NamedSecurityScheme | { name: string; scheme: SecurityScheme }
  }
}

export interface OperationMeta {
  operationId?: string
  summary?: string
  description?: string
  tags?: Array<string>
  deprecated?: boolean
}

export interface CollectOptions {
  /**
   * Only include routes whose path starts with one of these prefixes (e.g.
   * `['/api']`). When omitted, every route that declares server handlers is
   * included.
   */
  include?: Array<string>
  /** HTTP methods to emit operations for (default: get/post/put/patch/delete). */
  methods?: Array<OpenApiMethod>
}

const DEFAULT_METHODS: Array<OpenApiMethod> = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
]

/**
 * Walk a live route tree and collect a normalized {@link OpenApiManifest}.
 *
 * Reads only *declarative* metadata — it resolves the `handlers` builder (which
 * is a pure `(d) => d` at runtime) and reads `response` / `inputValidator` /
 * `securityScheme` off the resolved options. It never invokes a route handler or
 * a middleware `.server()` function.
 */
export function collectFromRouteTree(
  root: RuntimeRouteNode,
  options: CollectOptions = {},
): OpenApiManifest {
  const methods = new Set(options.methods ?? DEFAULT_METHODS)
  const operations: Array<OperationInput> = []
  const securitySchemes = new Map<string, SecurityScheme>()

  for (const node of walk(root)) {
    const server = node.options?.server
    if (!server?.handlers) continue

    const fullPath = node.fullPath ?? node.path
    if (!fullPath) continue
    if (options.include && !options.include.some((p) => fullPath.startsWith(p)))
      continue

    const handlers = resolveHandlers(server.handlers)
    const routeSecurity = collectSecurity(server.middleware, securitySchemes)
    const routeSlots = collectSlots(server.middleware)
    const openApiPath = toOpenApiPath(fullPath)

    for (const [methodKey, entry] of Object.entries(handlers)) {
      const method = methodKey.toLowerCase() as OpenApiMethod
      if (!methods.has(method)) continue

      const builder = isBuilderOptions(entry) ? entry : undefined
      const methodSecurity = collectSecurity(builder?.middleware, securitySchemes)
      const methodSlots = mergeSlots(
        routeSlots,
        collectSlots(builder?.middleware),
        builder?.inputValidator,
      )

      operations.push({
        method,
        path: openApiPath,
        request: emptyToUndefined(methodSlots),
        responses: builder?.response,
        security:
          routeSecurity.length || methodSecurity.length
            ? dedupe([...routeSecurity, ...methodSecurity])
            : undefined,
        operationId: builder?.meta?.operationId,
        summary: builder?.meta?.summary,
        description: builder?.meta?.description,
        tags: builder?.meta?.tags,
        deprecated: builder?.meta?.deprecated,
      })
    }
  }

  return {
    operations,
    securitySchemes: [...securitySchemes].map(([name, scheme]) => ({
      name,
      scheme,
    })),
  }
}

function* walk(node: RuntimeRouteNode): Generator<RuntimeRouteNode> {
  yield node
  const children = node.children
  if (!children) return
  const list = Array.isArray(children) ? children : Object.values(children)
  for (const child of list) yield* walk(child)
}

function resolveHandlers(
  handlers: NonNullable<RuntimeServerOptions['handlers']>,
): Record<string, RuntimeMethodHandler> {
  if (typeof handlers === 'function') {
    // The builder fn is pure: `({ createHandlers }) => createHandlers({...})`,
    // and `createHandlers` is the identity. Resolving it never runs a handler.
    return handlers({ createHandlers: (d: any) => d })
  }
  return handlers
}

function isBuilderOptions(
  entry: RuntimeMethodHandler,
): entry is RuntimeMethodBuilderOptions {
  return typeof entry === 'object'
}

/** Flatten a middleware chain (each may nest `.middleware([...])`), parents first. */
function flatten(
  middleware: Array<RuntimeMiddleware> | undefined,
): Array<RuntimeMiddleware> {
  const out: Array<RuntimeMiddleware> = []
  for (const m of middleware ?? []) {
    out.push(...flatten(m.options?.middleware), m)
  }
  return out
}

function collectSecurity(
  middleware: Array<RuntimeMiddleware> | undefined,
  registry: Map<string, SecurityScheme>,
): Array<string> {
  const names: Array<string> = []
  for (const m of flatten(middleware)) {
    const s = m.options?.securityScheme
    if (!s) continue
    registry.set(s.name, s.scheme)
    names.push(s.name)
  }
  return names
}

function collectSlots(
  middleware: Array<RuntimeMiddleware> | undefined,
): InputValidatorSlots {
  let slots: InputValidatorSlots = {}
  for (const m of flatten(middleware)) {
    slots = mergeSlots(slots, m.options?.inputValidator)
  }
  return slots
}

/**
 * Merge slot validators. Last writer wins per slot — the design's open question
 * #2 (whether request validators should *intersect* like function middleware)
 * deliberately surfaces here; intersection would require an `allOf` merge, which
 * we leave as a follow-up (see `DESIGN.md`).
 */
function mergeSlots(
  ...sources: Array<InputValidatorSlots | undefined>
): InputValidatorSlots {
  const out: InputValidatorSlots = {}
  for (const src of sources) {
    if (!src) continue
    for (const slot of ['body', 'query', 'path', 'headers'] as const) {
      const schema = src[slot]
      if (schema) out[slot] = schema
    }
  }
  return out
}

function emptyToUndefined(
  slots: InputValidatorSlots,
): InputValidatorSlots | undefined {
  return Object.keys(slots).length ? slots : undefined
}

/** `/api/v1/sequences/$id` → `/api/v1/sequences/{id}` (TanStack `$param` → OpenAPI). */
export function toOpenApiPath(fullPath: string): string {
  return fullPath
    .split('/')
    .map((seg) => {
      if (seg.startsWith('$') && seg.length > 1) return `{${seg.slice(1)}}`
      if (seg === '$') return '{_splat}'
      return seg
    })
    .join('/')
}

function dedupe<T>(arr: Array<T>): Array<T> {
  return [...new Set(arr)]
}
