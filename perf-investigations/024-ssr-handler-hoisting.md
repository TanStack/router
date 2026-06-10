# 024 — SSR: hoist per-request handler boilerplate (URL parses, options factory, middleware flattening)

|                 |                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Area            | `packages/start-server-core/src/createStartHandler.ts`, `ssr-server.ts`, `createStart.ts` (server-only) |
| Benchmarks      | ssr (react)                                                                                             |
| Expected impact | Small (~1%), but item 1 is essentially free                                                             |
| Confidence      | High on item 1; medium on item 2                                                                        |
| Risk            | Low (server-only code, no bundle constraint)                                                            |
| Prior art       | none found                                                                                              |

## Problem

`createStartHandler.ts:410-449` runs on 100% of requests, before any routing:

1. **Redundant URL parsing**: `getNormalizedURL(request.url)` (`:410`) parses the URL twice internally (`ssr-server.ts:762-781`: `rawUrl` + final `new URL`), then `getOrigin(request)` (`:412`) does a third `new URL(request.url)` (`ssr-server.ts:749-754`), and `new H3Event(request)` in `requestHandler` (`request-response.ts:127`) builds a fourth (`FastURL`).
2. **Per-request re-derivation of per-process-constant data**:
   - `await entries.startEntry.startInstance?.getOptions()` (`:421`) re-invokes the user's options factory and re-dedupes serialization adapters every request (`createStart.ts:138-149`: new `Set` + `Array.from`).
   - `serializationAdapters` array rebuilt (`:427-431`), `requestStartOptions` spread (`:433-439`), `flattenMiddlewares` re-flattened + `new Set` (`:442-449`).

Profile: `startRequestResolver` 0.2% self plus scattered URL/Set work inside the node-internals bucket (7.8%).

## Proposed approach

1. Return `origin` from `getNormalizedURL` (it already has `rawUrl.origin`) and delete the `getOrigin` call. Free.
2. Memoize the derived data keyed by the resolved options object identity (`WeakMap`/last-value cache): `getOptions()` result → `serializationAdapters` → flattened request middlewares. Dynamic factories returning fresh objects still work (cache miss); static ones (the common case) hit.
3. Consider feeding the H3Event's already-parsed URL into normalization, or vice versa.

## Risks & constraints

- `getOptions()` is user code and may be intentionally dynamic — never cache across differing returned objects; key strictly by identity (or document that options must be stable).
- The `executedRequestMiddlewares` `Set` is mutated per request (`createStartHandler.ts:783`) — only the flattened **array** is cacheable; the Set must stay per-request.
- Server-only: no client bundle pressure.

## Validation

```bash
CI=1 NX_DAEMON=false pnpm nx run @benchmarks/ssr:test:perf:react --outputStyle=stream --skipRemoteCache
pnpm nx run @tanstack/start-server-core:test:unit
```

Also run a start e2e suite touching request middleware ordering and custom basepath/origin handling.
