# Auto-generating OpenAPI from TanStack Start server routes

> Design + working prototype for [discussion #7530](https://github.com/TanStack/router/discussions/7530).
> Package: `@tanstack/start-openapi`.

This document answers the discussion's five questions with code-grounded
reasoning, then specifies the additive API surface and the build pass. The
**emit half is already implemented and tested** in this package (see
`src/emit.ts`, `src/collect.ts`, `tests/openapi.test.ts`) so the design is
backed by running code, not just prose.

---

## TL;DR

1. **Source of truth = server routes**, not server functions. Confirmed by the
   code: routes are raw `Request`/`Response` with real REST paths in the route
   tree; server functions are seroval-framed RPC.
2. **Three additive, declarative fields** carry the entire spec:
   - `inputValidator` (slot-shaped) on `RequestMiddleware` **and** inline on a
     method builder — mirrors `FunctionMiddleware`'s existing `inputValidator`.
   - `securityScheme` on `RequestMiddleware` — declared once on an auth
     middleware, inherited by every route in its chain.
   - `response` (per-status map) on the **method** builder — the one piece that
     is genuinely not middleware.
3. **The crux that makes this work**: all three are read *statically after module
   eval*. The `handlers` builder is a pure `(d) => d` at runtime
   (`createStartHandler.ts:793`), and middleware stash their args on a plain
   `.options` object (`createMiddleware.ts:40-66`) without running `.server()`.
   So a build pass can read schemas without executing a single handler.
4. **Emit** via Standard Schema → JSON Schema (Zod v4's `z.toJSONSchema`, which
   emits 2020-12 = OpenAPI 3.1's dialect). Already implemented here.

---

## Why server routes (grounded in the code)

| Aspect | Server **function** | Server **route** |
| --- | --- | --- |
| URL | opaque RPC (`/_serverFn/...`) | real REST path in route tree |
| Body | seroval-framed | raw JSON (`request.json()`) |
| Validator | `inputValidator` exists (`FunctionMiddlewareValidator`, `createMiddleware.ts:676`) | **none today** |
| Build visibility | — | tree already walked to emit `routeTree.gen.ts` |

The method builder today is `{ handler?, middleware? }` only
(`RouteMethodBuilderOptions`, `serverRoute.ts:393`) — exactly the intentional
extension point the discussion identified. The handler ctx is
`{ context, request, params, pathname, next }` (`serverRoute.ts:469`), so request
shape is invisible to any generator. This design adds the missing declarative
metadata.

---

## The architecture: two seams

```
                    ┌─────────────────────────┐
  live route tree → │  collectFromRouteTree()  │ → OpenApiManifest
   (+ middleware)   └─────────────────────────┘    (normalized operations)
                                                          │
                    ┌─────────────────────────┐           ▼
  OpenApiManifest → │   buildOpenApiDocument() │ → OpenAPI 3.1 document
                    └─────────────────────────┘
```

Splitting **collect** (read router runtime shapes) from **emit** (produce
OpenAPI) is the key design decision:

- The emitter is pure and router-agnostic — unit-testable without booting Start
  (see the emitter tests, which use no router at all).
- Any collector can target the manifest seam: the runtime collector shipped here,
  a future AST-based one, or a hand-written manifest.
- `OperationInput` (in `types.ts`) is the contract between them.

### Why a *runtime* collector, not pure AST

The generator that emits `routeTree.gen.ts` parses **AST** and only extracts
top-level prop *keys* (`createFileRouteProps`, `transform.ts:324`). It never has
the actual Zod objects — those are runtime values. To call `z.toJSONSchema()` you
need the real schema instance.

The cleanest path is therefore a thin **runtime** pass: import the generated
route tree (already a module), walk it, and read the declarative `.options`. This
is safe precisely because the spec-bearing fields are declarative — resolving the
`handlers` builder runs `(d) => d`, not your handler. This package's
`collectFromRouteTree` does exactly that and never invokes a handler or a
middleware `.server()`.

> A pure-AST collector is possible later (statically resolve the schema
> expressions), but it duplicates a type-checker and breaks the moment a schema
> is imported from another module. The runtime pass is correct by construction.

---

## API surface (additive, declarative)

### 1. `inputValidator` on `RequestMiddleware` (slot-shaped)

`FunctionMiddleware` already has `inputValidator` (`createMiddleware.ts:676`).
`RequestMiddleware` explicitly does **not** — its `~types` hard-code
`allInput: undefined` (`createMiddleware.ts:740`). HTTP has *locations* the
server-fn model lacks, so the route validator is **slot-keyed**:

```ts
const jsonBody = createMiddleware({ type: 'request' })
  .inputValidator({ body: CreateSequenceSchema, query: PaginationSchema })
  .server(({ next, data }) => next({ context: { input: data } }))
```

**Answering Q2 (is the slot shape right?):** yes. `{ body, query, path, headers }`
is the minimal set that maps 1:1 to OpenAPI parameter locations + request body.
A single flat schema can't express "this field is a header vs. a query param".

### 2. `securityScheme` on `RequestMiddleware`

```ts
const apiKeyAuth = createMiddleware({ type: 'request' })
  .securityScheme({ name: 'bearerAuth', scheme: { type: 'http', scheme: 'bearer' } })
  .server(/* verify token */)
```

Declared once, inherited by every route whose chain includes it. The collector
walks the (flattened) middleware chain and emits `security` + registers the
scheme in `components.securitySchemes`.

### 3. `response` on the method builder

The one piece that is **not** middleware — responses are a property of the
endpoint, not the chain:

```ts
POST: {
  inputValidator: { body: CreateSequenceSchema },
  response: { 202: CreateSequenceResultSchema, 402: ErrorSchema },
  handler: ({ data, context }) => Response.json(/* … */, { status: 202 }),
}
```

**Answering Q4 (per-status map vs. success+error convention):** per-status map.
It is the only shape that round-trips to OpenAPI losslessly. A
"success-schema + error convention" forces a guess about status codes the
generator can't make, and breaks the moment one endpoint returns 201 and another
202.

### Runtime wiring (small, additive)

- `createMiddleware`: add `inputValidator` (for the `request` type) and
  `securityScheme` builder methods that `Object.assign` onto `resolvedOptions`
  (same pattern as the existing methods, `createMiddleware.ts:40-66`).
- For request middleware, `inputValidator` should also **run** on the request
  (validate `body`/`query`/`path`/`headers`, assign to `data`) — reusing
  `execValidator` (`createServerFn.ts:878`). That makes it a real feature
  independent of OpenAPI.
- Method builder: accept `response` and `inputValidator` on
  `RouteMethodBuilderOptions` (`serverRoute.ts:393`). `response` is
  metadata-only (never executed); `inputValidator` validates before `handler`.

---

## Build-pass integration

```ts
// e.g. a Vite plugin hook or a CLI invoked post-build
import { routeTree } from './src/routeTree.gen'
import { generateOpenApiDocument } from '@tanstack/start-openapi'
import { writeFile } from 'node:fs/promises'

const spec = await generateOpenApiDocument(routeTree, {
  info: { title: 'My API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  include: ['/api'],
})
await writeFile('openapi.json', JSON.stringify(spec, null, 2))
```

The natural home is a `router-generator` `GeneratorPlugin`
(`onRouteTreeChanged`, `generator.ts:587`) **or** a `start-plugin-core` build
hook that runs after the server bundle exists (so the route module is
importable). The generator hook only has AST nodes; the schema objects require
the runtime module — so the emit step belongs wherever the built route tree can
be imported (post-build, in-process). See "Open questions" for the placement
decision.

---

## Answers to the discussion's questions

1. **Core vs. community plugin?** The three *declarative fields* belong in core
   (they're tiny, and `inputValidator` on request middleware is a real feature
   regardless of OpenAPI). The *emitter* can live in a dedicated package like
   this one — core gains the metadata, the spec generation stays opt-in.
2. **`inputValidator` on `RequestMiddleware` + slot shape?** Yes and yes — see
   above. It closes the asymmetry with `FunctionMiddleware`, and slots are
   required because HTTP locations don't exist in the server-fn model.
3. **Should `validateSearch` feed `parameters[in:query]`?** Yes — to avoid two
   query mechanisms, the collector should read `route.options.validateSearch`
   (`route.ts:973`) as the `query` slot when no explicit `query` validator is
   given. *(Not yet wired in the prototype — see Open questions; it's a
   one-liner in `collect.ts` once we decide precedence.)*
4. **Response declaration?** Per-status map. (Implemented.)
5. **Prior art?** Related issues #3608, #5129, #7315 noted in the discussion.

---

## What's implemented vs. proposed

| Piece | Status |
| --- | --- |
| Emitter (`buildOpenApiDocument`) — params, body, responses, security, `$id`/`$defs` hoist | ✅ implemented + tested |
| Runtime collector (`collectFromRouteTree`) reading proposed declarative fields | ✅ implemented + tested |
| Zod v4 default converter (`defaultToJSONSchema`) | ✅ implemented + tested (e2e) |
| `$param` → `{param}` path conversion | ✅ implemented + tested |
| Core: `inputValidator`/`securityScheme` on `RequestMiddleware` | 📐 specified (additive type + runtime sketch) |
| Core: `response`/`inputValidator` on method builder | 📐 specified |
| `validateSearch` → query parameters | 📐 specified (precedence TBD) |
| Validator **intersection** across the request-middleware chain | ⚠️ open — collector currently does last-writer-wins per slot |

---

## Open questions / what I'd want maintainer input on

- **Intersection semantics.** Function-middleware validators *intersect*
  (`IntersectAllMiddleware`, `createMiddleware.ts:195`). Should slot validators
  on a request-middleware chain intersect per-slot (`allOf` merge) or
  last-writer-win? The collector is structured to swap this in one function
  (`mergeSlots` in `collect.ts`).
- **Build placement.** `router-generator` plugin hook (AST-only, no schemas) vs.
  a post-build in-process pass that imports the route tree (has schemas). I lean
  to the latter for correctness; happy to wire whichever the team prefers.
- **`validateSearch` precedence** when both it and an explicit `query` slot
  exist.
- **Type-level slot intersection** in the `RequestMiddleware` types is real work
  (mirroring `IntersectAllValidatorOutputs`); the runtime + emitter don't need it
  to function, so it can land incrementally.

---

## Try it

```bash
pnpm --filter @tanstack/start-openapi test:unit
```
