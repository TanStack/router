# Describing TanStack Start server routes: OpenAPI and MCP

> Design + working implementation for [discussion #7530](https://github.com/TanStack/router/discussions/7530).
> Package: `@tanstack/start-openapi`, plus additive fields in `@tanstack/start-client-core` / `@tanstack/start-server-core`.

## Why

Start server routes today declare only `handler` and `middleware`. The request
shape is invisible to any tool, so nothing can describe the API: no OpenAPI
document, no client generation, and no way to expose the routes to a model.

That last one is the driver. We are building an MCP server feature in
[TanStack AI](https://github.com/TanStack/ai). An MCP tool is an operation with
a name, a description, an input schema, an output schema and a security
requirement. That is exactly what an OpenAPI operation needs too. If a route
declares those once, it can be a REST endpoint, an OpenAPI operation and an MCP
tool with no per-tool code:

```ts
export const Route = createFileRoute('/api/v1/sequences/$id')({
  server: {
    middleware: [authMiddleware],
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: {
          description:
            'Get a compact sequence summary with counts and media links.',
          validator: { path: z.object({ id: ulidSchema }) },
          response: { 200: sequenceSummarySchema, 404: errorEnvelopeSchema },
          handler: ({ context, data }) => Response.json(/* ... */),
        },
      }),
  },
})
```

On the MCP side, a `tools/call` synthesises a `Request` to that path, forwards
the caller's `Authorization` header and runs it through Start's own request
pipeline in-process. Middleware does auth exactly as it does for REST. The 200
schema becomes `outputSchema`, the JSON body becomes `structuredContent`, and a
GET gets `readOnlyHint`. The MCP server becomes one line:

```ts
createMCPServer({ tools: fromRouteTree(routeTree) })
```

`fromRouteTree` lives in TanStack AI and consumes the manifest described below.
This package is the OpenAPI emitter for the same manifest.

---

## The API surface (additive, declarative)

### 1. `validator` on request middleware and the method builder (slot-shaped)

Matches the `inputValidator` → `validator` rename on server functions (#7566).
HTTP has locations the server function model lacks, so the validator is keyed
by slot, and each slot maps 1:1 to an OpenAPI location:

```ts
const paginated = createMiddleware({ type: 'request' })
  .validator({ query: PaginationSchema })
  .server(({ next }) => next())

POST: {
  validator: { body: CreateSequenceSchema },
  handler: ({ data }) => { /* data.body, data.query */ },
}
```

Slots are `body`, `query`, `path` and `headers`, each a Standard Schema.

**Runtime.** Start validates every slot after the middleware chain and before
the handler, so auth rejects before validation does. The result is passed as
`ctx.data`. A failure returns `400` with `{ message, issues: [{ slot, issues }] }`.

**Types.** `ctx.data` is inferred from the route's middleware chain plus the
method's `validator` when using `createHandlers`. The plain `handlers: { GET: {...} }`
record cannot infer per-method generics, so `data` is loose there, the same as
`context` is today.

### 2. `response` on the method builder

A per-status map of schemas (or `{ description, schema, mediaType }`). Metadata
only, never executed. A per-status map is the only shape that round-trips to
OpenAPI without guessing status codes.

### 3. Operation metadata on the method builder

`operationId`, `summary`, `description`, `tags`, `deprecated`. OpenAPI
tolerates a missing `description`, a model does not: it is the only thing
telling the model when to call the tool.

---

## Decisions

- **Security lives in the generator, not in core.** Auth runs inside a
  middleware's `.server()`, which a collector cannot see. Rather than add a
  metadata-only field to core, the generator takes a map from auth middleware
  to the scheme it enforces:

  ```ts
  generateOpenApiDocument(routeTree, {
    info,
    securitySchemes: new Map([
      [
        authMiddleware,
        { name: 'bearerAuth', scheme: { type: 'http', scheme: 'bearer' } },
      ],
    ]),
  })
  ```

  Every route whose chain (including parent routes) contains that middleware
  gets `security`. MCP barely needs it: MCP auth is server-level, and forwarding
  the caller's `Authorization` header lets the real middleware enforce it.

- **Tool / operation names.** `operationId` when declared, otherwise derived
  from method and path: `GET /api/v1/sequences/$id` → `getApiV1SequencesById`
  (`defaultOperationId`). The result only uses `[A-Za-z0-9]`, so it is a valid
  MCP tool name as-is.
- **Validators across a middleware chain intersect.** Every schema in the
  chain (parent routes, the route, method middleware, the method) must pass for
  its slot. Last-writer-wins would let a route silently drop a header an auth
  middleware requires. At runtime object outputs are shallow-merged into
  `data[slot]`; in the types they intersect. The emitter uses `allOf` for a body
  declared more than once, and for a parameter declared by more than one schema
  (required if any schema requires it).
- **Ancestor middleware applies.** The collector walks the route tree carrying
  parent routes' `server.middleware`, matching the order Start runs it in.

---

## The architecture: two seams

```
  live route tree → collectFromRouteTree() → manifest (operations + security schemes)
  manifest        → buildOpenApiDocument() → OpenAPI 3.1 document
  manifest        → fromRouteTree()        → MCP tools (TanStack AI)
```

The manifest (`OpenApiManifest` / `OperationInput` in `types.ts`) is the
contract. The collector reads the live route tree after module evaluation. It
can do that without running anything: the `handlers` builder is an identity
function at runtime and middleware stash their options on a plain object
without running `.server()`. A pure-AST collector cannot work, because
converting to JSON Schema needs the real schema instances.

Zod v4's `z.toJSONSchema` emits JSON Schema 2020-12, which is OpenAPI 3.1's
dialect; other vendors pass `toJSONSchema`.

---

## Open questions

- **Build placement.** A post-build pass that imports the route tree (has the
  schemas) vs. a `router-generator` plugin hook (AST only). The former is
  correct by construction.
- **`validateSearch` → query parameters**, and precedence against an explicit
  `query` slot.
- **Parent-route validators in `ctx.data` types.** They run and are emitted, but
  the handler's `data` type only covers the route's own and method middleware.
