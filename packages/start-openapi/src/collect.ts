import type {
  NamedSecurityScheme,
  OpenApiManifest,
  OpenApiMethod,
  OperationInput,
  RequestSlot,
  RequestSlotSchemas,
  RequestValidatorSlots,
  ResponseMap,
  SecurityScheme,
} from './types'

/**
 * Structural views of the *live* TanStack Start runtime shapes the collector
 * reads. These mirror the real runtime objects (`route.options.server`,
 * `middleware.options`, a method builder's resolved options) without importing
 * router internals — so the collector compiles standalone and stays robust to
 * unrelated type churn.
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
    | ((opts: {
        createHandlers: (d: any) => any
      }) => Record<string, RuntimeMethodHandler>)
}

/** A method entry: either a bare handler fn (no metadata) or a builder options object. */
export type RuntimeMethodHandler =
  | ((...args: Array<any>) => unknown)
  | RuntimeMethodBuilderOptions

export interface RuntimeMethodBuilderOptions {
  handler?: (...args: Array<any>) => unknown
  middleware?: Array<RuntimeMiddleware>
  /** Per-status response schemas. */
  response?: ResponseMap
  /** Slot-shaped validator. */
  validator?: RequestValidatorSlots
  operationId?: string
  summary?: string
  description?: string
  tags?: Array<string>
  deprecated?: boolean
}

export interface RuntimeMiddleware {
  options?: {
    middleware?: Array<RuntimeMiddleware>
    /** Slot-shaped validator on request middleware. */
    validator?: RequestValidatorSlots
    /** Declarative security scheme. */
    securityScheme?: NamedSecurityScheme
  }
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

const SLOTS: Array<RequestSlot> = ['body', 'query', 'path', 'headers']

/**
 * Walk a live route tree and collect a normalized {@link OpenApiManifest}.
 *
 * Reads only *declarative* metadata — it resolves the `handlers` builder (which
 * is a pure `(d) => d` at runtime) and reads `response` / `validator` /
 * `securityScheme` off the resolved options. It never invokes a route handler or
 * a middleware `.server()` function.
 *
 * Middleware on ancestor routes applies too, matching the order Start runs it
 * in: parent routes, the route itself, then the method.
 */
export function collectFromRouteTree(
  root: RuntimeRouteNode,
  options: CollectOptions = {},
): OpenApiManifest {
  const methods = new Set(options.methods ?? DEFAULT_METHODS)
  const operations: Array<OperationInput> = []
  const securitySchemes = new Map<string, SecurityScheme>()

  for (const { node, middleware } of walk(root, [])) {
    const server = node.options?.server
    if (!server?.handlers) continue

    const fullPath = node.fullPath ?? node.path
    if (!fullPath) continue
    if (options.include && !options.include.some((p) => fullPath.startsWith(p)))
      continue

    const handlers = resolveHandlers(server.handlers)
    const openApiPath = toOpenApiPath(fullPath)

    for (const [methodKey, entry] of Object.entries(handlers)) {
      const method = methodKey.toLowerCase() as OpenApiMethod
      if (!methods.has(method)) continue

      const builder = isBuilderOptions(entry) ? entry : undefined
      const chain = flatten([...middleware, ...(builder?.middleware ?? [])])
      const security = collectSecurity(chain, securitySchemes)
      const request = collectSlots([
        ...chain.map((m) => m.options?.validator),
        builder?.validator,
      ])

      operations.push({
        method,
        path: openApiPath,
        request,
        responses: builder?.response,
        security: security.length ? security : undefined,
        operationId:
          builder?.operationId ?? defaultOperationId(method, openApiPath),
        summary: builder?.summary,
        description: builder?.description,
        tags: builder?.tags,
        deprecated: builder?.deprecated,
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

function* walk(
  node: RuntimeRouteNode,
  inherited: Array<RuntimeMiddleware>,
): Generator<{ node: RuntimeRouteNode; middleware: Array<RuntimeMiddleware> }> {
  const middleware = [...inherited, ...(node.options?.server?.middleware ?? [])]
  yield { node, middleware }
  const children = node.children
  if (!children) return
  const list = Array.isArray(children) ? children : Object.values(children)
  for (const child of list) yield* walk(child, middleware)
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

/**
 * Flatten a middleware chain (each may nest `.middleware([...])`), parents
 * first, deduped like Start's own `flattenMiddlewares`.
 */
function flatten(
  middleware: Array<RuntimeMiddleware>,
  seen = new Set<RuntimeMiddleware>(),
): Array<RuntimeMiddleware> {
  const out: Array<RuntimeMiddleware> = []
  for (const m of middleware) {
    out.push(...flatten(m.options?.middleware ?? [], seen))
    if (!seen.has(m)) {
      seen.add(m)
      out.push(m)
    }
  }
  return out
}

function collectSecurity(
  chain: Array<RuntimeMiddleware>,
  registry: Map<string, SecurityScheme>,
): Array<string> {
  const names = new Set<string>()
  for (const m of chain) {
    const s = m.options?.securityScheme
    if (!s) continue
    registry.set(s.name, s.scheme)
    names.add(s.name)
  }
  return [...names]
}

/**
 * Gather every schema per slot. Start validates the request against all of
 * them (intersection), so none may be dropped.
 */
function collectSlots(
  sources: Array<RequestValidatorSlots | undefined>,
): RequestSlotSchemas | undefined {
  const out: RequestSlotSchemas = {}
  for (const src of sources) {
    for (const slot of SLOTS) {
      const schema = src?.[slot]
      if (schema) (out[slot] ??= []).push(schema)
    }
  }
  return Object.keys(out).length ? out : undefined
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

/**
 * Derive an operation name from method + path when none is declared:
 * `get /api/v1/sequences/{id}` → `getApiV1SequencesById`. Satisfies MCP tool
 * name rules (`[A-Za-z0-9_-]`) so it can be used as the tool name as-is.
 */
export function defaultOperationId(method: string, path: string): string {
  const words = path
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      const param = /^\{(.+)\}$/.exec(seg)?.[1]
      return param ? `by_${param}` : seg
    })
    .flatMap((seg) => seg.split(/[^A-Za-z0-9]+/))
    .filter(Boolean)
  return [method.toLowerCase(), ...words.map(capitalize)].join('')
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1)
}
